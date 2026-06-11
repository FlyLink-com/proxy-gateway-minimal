import assert from "node:assert/strict";
import test from "node:test";
import {
  createDataPlaneAgentService,
  hashDataPlaneAgentToken
} from "../services/edge/data-plane-agent-service.mjs";

const VALID_UNTIL = "2026-07-10T00:00:00.000Z";
const NOW = new Date("2026-06-10T00:00:00.000Z");

function desired(overrides = {}) {
  return {
    desiredStateRef: "desired_sgp_001",
    nodeRef: "node-sgp-a",
    generation: "gen_20260610_001",
    channelRefs: ["channel-sgp-a-hy2", "channel-sgp-a-tuic"],
    edgeCredentialRefs: ["edgecred_safe_hy2", "edgecred_safe_tuic"],
    materialDigests: [
      {
        channelRef: "channel-sgp-a-hy2",
        edgeCredentialRef: "edgecred_safe_hy2",
        digest: "sha256:aaaaaaaaaaaaaaaa"
      },
      {
        channelRef: "channel-sgp-a-tuic",
        edgeCredentialRef: "edgecred_safe_tuic",
        digest: "sha256:bbbbbbbbbbbbbbbb"
      }
    ],
    validUntil: VALID_UNTIL,
    ...overrides
  };
}

function receipt(overrides = {}) {
  return {
    type: "gccgw_data_plane_apply_receipt",
    nodeRef: "node-sgp-a",
    generation: "gen_20260610_001",
    channelRef: "channel-sgp-a-hy2",
    status: "applied",
    configTest: true,
    serviceActive: true,
    listenerPresent: true,
    credentialCount: 2,
    appliedAt: "2026-06-10T00:01:00.000Z",
    reasonCode: "runtime_applied",
    materialDigests: ["sha256:aaaaaaaaaaaaaaaa"],
    ...overrides
  };
}

function fakeControlStore(latestByChannel = new Map()) {
  const receipts = [];
  const leases = [];
  return {
    receipts,
    leases,
    getLatestEdgeDesiredStateForChannel(channelRef) {
      return latestByChannel.get(channelRef) || null;
    },
    recordEdgeApplyReceipt(input) {
      const existing = receipts.find((item) => item.id === input.id);
      const stored = {
        ...existing,
        ...input,
        configTestOk: input.configTestOk === true,
        listenerPresent: input.listenerPresent === true,
        serviceActive: input.serviceActive === true
      };
      if (existing) {
        Object.assign(existing, stored);
        return existing;
      }
      receipts.push(stored);
      return stored;
    },
    acquireEdgeAgentLease(input) {
      const stored = {
        leaseRef: input.leaseRef,
        agentRef: input.agentRef,
        nodeRef: input.nodeRef,
        channelRef: input.channelRef,
        desiredStateRef: input.desiredStateRef,
        status: input.status,
        acquiredAt: input.acquiredAt,
        renewedAt: input.renewedAt,
        expiresAt: input.expiresAt
      };
      leases.push(stored);
      return stored;
    }
  };
}

function serviceFor(store, overrides = {}) {
  return createDataPlaneAgentService({
    controlStore: store,
    nodes: [
      {
        nodeRef: "node-sgp-a",
        channelRefs: ["channel-sgp-a-hy2", "channel-sgp-a-tuic"],
        tokenSha256: hashDataPlaneAgentToken("node-agent-token")
      }
    ],
    nowFn: () => NOW,
    ...overrides
  });
}

test("authenticates node bearer token without accepting missing or wrong tokens", () => {
  const service = serviceFor(fakeControlStore());

  assert.deepEqual(service.authenticate({ authorization: "Bearer node-agent-token" }), {
    nodeRef: "node-sgp-a",
    channelRefs: ["channel-sgp-a-hy2", "channel-sgp-a-tuic"]
  });
  assert.throws(
    () => service.authenticate({ authorization: "" }),
    (error) => error.code === "unauthorized" && error.statusCode === 401
  );
  assert.throws(
    () => service.authenticate({ authorization: "Bearer console-token" }),
    (error) => error.code === "unauthorized" && error.statusCode === 401
  );
});

test("pulls only node-scoped desired states and returns redacted summaries", () => {
  const store = fakeControlStore(new Map([
    ["channel-sgp-a-hy2", desired()],
    ["channel-sgp-a-tuic", desired()],
    ["channel-other-a-hy2", desired({ nodeRef: "node-other-a" })]
  ]));
  const service = serviceFor(store);
  const identity = service.authenticate({ authorization: "Bearer node-agent-token" });

  const response = service.getDesiredState(identity);

  assert.equal(response.type, "gccgw_data_plane_agent_desired_state_response");
  assert.equal(response.nodeRef, "node-sgp-a");
  assert.equal(response.redacted, true);
  assert.equal(response.desiredStates.length, 1);
  assert.equal(response.summaries.length, 1);
  assert.equal(response.summaries[0].channelCount, 2);
  assert.doesNotMatch(JSON.stringify(response), /password|privateKey|subscriptionUrl/i);
});

test("records receipts against latest desired state and never trusts client desired refs", () => {
  const store = fakeControlStore(new Map([
    ["channel-sgp-a-hy2", desired({ desiredStateRef: "desired_authoritative" })]
  ]));
  const service = serviceFor(store);
  const identity = service.authenticate({ authorization: "Bearer node-agent-token" });

  const response = service.recordReceipt(identity, receipt({ desiredStateRef: "client_supplied_wrong_ref" }));

  assert.equal(response.status, "applied");
  assert.equal(store.receipts.length, 1);
  assert.equal(store.receipts[0].desiredStateRef, "desired_authoritative");
  assert.equal(store.receipts[0].id, response.receiptId);
  assert.equal(store.receipts[0].generation, "gen_20260610_001");
});

test("maps unchanged receipts to DB-safe applied status with unchanged count", () => {
  const store = fakeControlStore(new Map([
    ["channel-sgp-a-hy2", desired()]
  ]));
  const service = serviceFor(store);
  const identity = service.authenticate({ authorization: "Bearer node-agent-token" });

  const response = service.recordReceipt(identity, receipt({
    status: "unchanged",
    reasonCode: undefined
  }));

  assert.equal(response.status, "applied");
  assert.equal(store.receipts[0].status, "applied");
  assert.equal(store.receipts[0].actionCounts.unchanged, 2);
  assert.equal(store.receipts[0].reasonCode, "generation_unchanged");
});

test("uses deterministic receipt id per node channel generation", () => {
  const store = fakeControlStore(new Map([
    ["channel-sgp-a-hy2", desired()]
  ]));
  const service = serviceFor(store);
  const identity = service.authenticate({ authorization: "Bearer node-agent-token" });

  const first = service.recordReceipt(identity, receipt({ appliedAt: "2026-06-10T00:01:00.000Z" }));
  const second = service.recordReceipt(identity, receipt({ appliedAt: "2026-06-10T00:02:00.000Z" }));

  assert.equal(first.receiptId, second.receiptId);
  assert.equal(store.receipts.length, 1);
});

test("rejects out-of-scope channels and unsafe receipt material", () => {
  const store = fakeControlStore(new Map([
    ["channel-sgp-a-hy2", desired()]
  ]));
  const service = serviceFor(store);
  const identity = service.authenticate({ authorization: "Bearer node-agent-token" });

  assert.throws(
    () => service.recordReceipt(identity, receipt({ channelRef: "channel-other-a-hy2" })),
    (error) => error.code === "channel_scope_mismatch"
  );
  assert.throws(
    () => service.recordReceipt(identity, receipt({ diagnostics: { token: "unsafe" } })),
    (error) => error.code === "unsafe_agent_payload"
  );
});

test("records per-channel lease heartbeat with latest desired state ref", () => {
  const store = fakeControlStore(new Map([
    ["channel-sgp-a-hy2", desired({ desiredStateRef: "desired_for_lease" })]
  ]));
  const service = serviceFor(store);
  const identity = service.authenticate({ authorization: "Bearer node-agent-token" });

  const lease = service.recordLease(identity, {
    channelRef: "channel-sgp-a-hy2",
    agentRef: "agent-sgp-a"
  });

  assert.equal(lease.type, "gccgw_data_plane_lease_response");
  assert.equal(lease.nodeRef, "node-sgp-a");
  assert.equal(lease.channelRef, "channel-sgp-a-hy2");
  assert.equal(store.leases[0].desiredStateRef, "desired_for_lease");
  assert.equal(lease.redacted, true);
});
