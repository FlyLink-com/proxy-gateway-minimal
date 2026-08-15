import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "../app.mjs";
import {
  createWalletFirstCurrentResourceProjection
} from "../services/platform/wallet-first-current-resource-projection.mjs";
import {
  createWalletFirstCurrentResourceSetupDelivery
} from "../services/platform/wallet-first-current-resource-setup-delivery.mjs";
import { listen } from "./helpers/listen.mjs";

const HANDOFF_REF = "setup_handoff_alpha";
const IDEMPOTENCY_KEY = "setup-idempotency-key-alpha-0001";
const SUBSCRIPTION_URL = "https://portal.example.test/sub/clash.yaml?token=opaque-test-token";
const AVAILABLE_RESOURCE = Object.freeze({
  state: "available",
  plan: Object.freeze({
    id: "monthly_30d_50gb",
    durationDays: 30,
    monthlyTrafficGb: 50
  }),
  validUntil: "2026-09-13T00:00:00.000Z",
  setupAvailable: false
});
const BINDING = Object.freeze({
  handoffRef: HANDOFF_REF,
  initialTransitionRef: "transition_initial_alpha",
  transitionRef: "transition_alpha",
  effectRef: "effect_alpha",
  tenantId: "tenant_alpha",
  artifactId: "artifact_alpha",
  tenantRef: "tenantref_alpha",
  artifactRef: "artifactref_alpha"
});

function closeServer(server) {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

function escrowBinding() {
  return {
    transitionRef: BINDING.transitionRef,
    effectRef: BINDING.effectRef,
    tenantId: BINDING.tenantId,
    artifactId: BINDING.artifactId
  };
}

function createSetupDelivery() {
  const calls = { claim: [], binding: [], acknowledge: [], release: [], escrowAck: [] };
  const service = createWalletFirstCurrentResourceSetupDelivery({
    controlStore: {
      readWalletFirstSetupDeliveryAvailabilityBinding() {
        return {
          state: "available",
          handoffRef: HANDOFF_REF,
          binding: structuredClone(BINDING)
        };
      },
      claimWalletFirstSetupDeliveryHandoff(input) {
        calls.claim.push(structuredClone(input));
        return {
          state: "claimed",
          handoffRef: HANDOFF_REF,
          claimGeneration: 1,
          binding: structuredClone(BINDING)
        };
      },
      readWalletFirstSetupDeliveryBinding(input) {
        calls.binding.push(structuredClone(input));
        return {
          state: "claimed",
          handoffRef: HANDOFF_REF,
          claimGeneration: 1,
          binding: structuredClone(BINDING)
        };
      },
      readWalletFirstSetupDeliveryAcknowledgementBinding(input) {
        calls.binding.push(structuredClone(input));
        return {
          state: "claimed",
          handoffRef: HANDOFF_REF,
          claimGeneration: 1,
          binding: structuredClone(BINDING)
        };
      },
      acknowledgeWalletFirstSetupDeliveryHandoff(input) {
        calls.acknowledge.push(structuredClone(input));
        return { state: "delivered" };
      },
      markWalletFirstSetupDeliveryHandoffReconciliationRequired() {
        return { state: "reconciliation_required" };
      }
    },
    deliveryEscrow: {
      getSetupDeliverySummary(input) {
        assert.deepEqual(input, escrowBinding());
        return {
          version: "wallet_first_setup_delivery_escrow_v1",
          state: "available",
          handoffRef: HANDOFF_REF,
          bindingDigest: "a".repeat(64),
          resourceDigest: "b".repeat(64)
        };
      },
      releaseSetupDelivery(input) {
        calls.release.push(structuredClone(input));
        return { handoffRef: HANDOFF_REF, subscriptionUrl: SUBSCRIPTION_URL };
      },
      acknowledgeSetupDelivery(input) {
        calls.escrowAck.push(structuredClone(input));
        return { handoffRef: HANDOFF_REF, status: "acknowledged" };
      }
    },
    nowFn: () => "2026-08-14T00:00:00.000Z"
  });
  return { service, calls };
}

function createProjection(setupDelivery) {
  return createWalletFirstCurrentResourceProjection({
    controlStore: {
      readWalletFirstCurrentResourceProjection() {
        return structuredClone(AVAILABLE_RESOURCE);
      }
    },
    ...(setupDelivery ? { setupDelivery } : {})
  });
}

function createState({ setupDelivery, projection = createProjection(setupDelivery) } = {}) {
  return {
    rootDir: resolve(fileURLToPath(new URL("../../", import.meta.url))),
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "console-secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    subscriptions: {},
    security: {
      adminAllowedCidrs: ["127.0.0.1/32"],
      subRateLimit: { windowMs: 60_000, max: 30 }
    },
    platform: {
      userPortalRoutesEnabled: true,
      userPortalAuth: {
        requireSession({ sessionRef }) {
          if (sessionRef !== "session_alpha") {
            const error = new Error("invalid session");
            error.code = "invalid_session";
            throw error;
          }
          return { sessionRef, accountId: "acct_alpha" };
        }
      },
      walletFirstCurrentResourceProjection: projection,
      ...(setupDelivery ? { walletFirstCurrentResourceSetupDelivery: setupDelivery } : {})
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

function requestOptions(body, headers = {}) {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  };
}

test("wallet-first setup route accepts only header-session exact setup input and returns the narrow one-time delivery DTO with non-cacheable headers", async (t) => {
  const { service, calls } = createSetupDelivery();
  const { server, baseUrl } = await listen(createApp(createState({ setupDelivery: service })));
  t.after(() => closeServer(server));

  const query = await fetch(`${baseUrl}/api/portal/resources/current/setup?accountId=acct_other`, (
    requestOptions({ idempotencyKey: IDEMPOTENCY_KEY }, { "X-Portal-Session": "session_alpha" })
  ));
  assert.equal(query.status, 400);
  assert.deepEqual(await query.json(), { error: "validation_error" });
  assert.deepEqual(calls.claim, []);

  const missingHeader = await fetch(`${baseUrl}/api/portal/resources/current/setup`, (
    requestOptions({ idempotencyKey: IDEMPOTENCY_KEY })
  ));
  assert.equal(missingHeader.status, 401);
  assert.deepEqual(await missingHeader.json(), { error: "invalid_session" });
  assert.deepEqual(calls.claim, []);

  const unauthenticatedMalformed = await fetch(`${baseUrl}/api/portal/resources/current/setup`, (
    requestOptions({ accountId: "acct_other" })
  ));
  assert.equal(unauthenticatedMalformed.status, 401);
  assert.deepEqual(await unauthenticatedMalformed.json(), { error: "invalid_session" });
  assert.deepEqual(calls.claim, []);

  const extraField = await fetch(`${baseUrl}/api/portal/resources/current/setup`, (
    requestOptions({
      idempotencyKey: IDEMPOTENCY_KEY,
      accountId: "acct_other"
    }, { "X-Portal-Session": "session_alpha" })
  ));
  assert.equal(extraField.status, 400);
  assert.deepEqual(await extraField.json(), { error: "validation_error" });
  assert.deepEqual(calls.claim, []);

  const response = await fetch(`${baseUrl}/api/portal/resources/current/setup`, (
    requestOptions({ idempotencyKey: IDEMPOTENCY_KEY }, { "X-Portal-Session": "session_alpha" })
  ));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(await response.json(), {
    delivery: {
      handoffRef: HANDOFF_REF,
      kind: "subscription_url",
      subscriptionUrl: SUBSCRIPTION_URL
    }
  });
  assert.equal(calls.claim.length, 1);
  assert.deepEqual(Object.keys(calls.claim[0]).sort(), [
    "accountId",
    "idempotencyKeyHash",
    "leaseMs",
    "now",
    "sessionBindingHash"
  ]);
  assert.doesNotMatch(JSON.stringify(calls.claim), /session_alpha|setup-idempotency-key-alpha-0001/);
  assert.deepEqual(calls.release, [{ handoffRef: HANDOFF_REF, ...escrowBinding() }]);
});

test("wallet-first setup acknowledgement accepts only its opaque handoff ref, sends no body, and never invokes a reveal path", async (t) => {
  const { service, calls } = createSetupDelivery();
  const { server, baseUrl } = await listen(createApp(createState({ setupDelivery: service })));
  t.after(() => closeServer(server));

  const rejected = await fetch(`${baseUrl}/api/portal/resources/current/setup/ack`, (
    requestOptions({ handoffRef: HANDOFF_REF, idempotencyKey: IDEMPOTENCY_KEY }, {
      "X-Portal-Session": "session_alpha"
    })
  ));
  assert.equal(rejected.status, 400);
  assert.deepEqual(await rejected.json(), { error: "validation_error" });
  assert.deepEqual(calls.acknowledge, []);

  const query = await fetch(`${baseUrl}/api/portal/resources/current/setup/ack?handoffRef=other`, (
    requestOptions({ handoffRef: HANDOFF_REF }, { "X-Portal-Session": "session_alpha" })
  ));
  assert.equal(query.status, 400);
  assert.deepEqual(await query.json(), { error: "validation_error" });
  assert.deepEqual(calls.acknowledge, []);

  const unauthenticatedMalformed = await fetch(`${baseUrl}/api/portal/resources/current/setup/ack`, (
    requestOptions({ accountId: "acct_other" })
  ));
  assert.equal(unauthenticatedMalformed.status, 401);
  assert.deepEqual(await unauthenticatedMalformed.json(), { error: "invalid_session" });
  assert.deepEqual(calls.acknowledge, []);

  const acknowledged = await fetch(`${baseUrl}/api/portal/resources/current/setup/ack`, (
    requestOptions({ handoffRef: HANDOFF_REF }, { "X-Portal-Session": "session_alpha" })
  ));
  assert.equal(acknowledged.status, 204);
  assert.equal(await acknowledged.text(), "");
  assert.equal(acknowledged.headers.get("cache-control"), "no-store");
  assert.equal(acknowledged.headers.get("referrer-policy"), "no-referrer");
  assert.equal(calls.acknowledge.length, 1);
  assert.deepEqual(calls.release, []);
  assert.deepEqual(calls.escrowAck, [{ handoffRef: HANDOFF_REF, ...escrowBinding() }]);
});

test("wallet-first setup routes fail closed when the state has not composed the delivery service", async (t) => {
  const { server, baseUrl } = await listen(createApp(createState()));
  t.after(() => closeServer(server));

  const setup = await fetch(`${baseUrl}/api/portal/resources/current/setup`, (
    requestOptions({ idempotencyKey: IDEMPOTENCY_KEY }, { "X-Portal-Session": "session_alpha" })
  ));
  assert.equal(setup.status, 503);
  assert.deepEqual(await setup.json(), { error: "wallet_first_setup_delivery_unavailable" });

  const ack = await fetch(`${baseUrl}/api/portal/resources/current/setup/ack`, (
    requestOptions({ handoffRef: HANDOFF_REF }, { "X-Portal-Session": "session_alpha" })
  ));
  assert.equal(ack.status, 503);
  assert.deepEqual(await ack.json(), { error: "wallet_first_setup_delivery_unavailable" });
});
