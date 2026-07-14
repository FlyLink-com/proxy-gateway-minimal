import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createDataPlaneAgentService,
  hashDataPlaneAgentToken,
  scopedDesiredStateFrom
} from "../services/edge/data-plane-agent-service.mjs";
import { createEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

const VALID_UNTIL = "2099-07-10T00:00:00.000Z";
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
    materialDigests: [
      "sha256:aaaaaaaaaaaaaaaa",
      "sha256:bbbbbbbbbbbbbbbb"
    ],
    ...overrides
  };
}

test("credential-scoped agent filters preserve channel revocation tombstones", () => {
  const tombstone = desired({
    channelRefs: ["channel-sgp-a-hy2"],
    edgeCredentialRefs: [],
    materialDigests: []
  });

  const scoped = scopedDesiredStateFrom(tombstone, {
    edgeCredentialRefs: ["edgecred_safe_hy2"]
  });

  assert.ok(scoped);
  assert.deepEqual(scoped.edgeCredentialRefs, []);
  assert.deepEqual(scoped.channelRefs, ["channel-sgp-a-hy2"]);
});

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
        listenerUdp443: input.listenerUdp443 === true,
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

function materialStoreFor(records = []) {
  return createEdgeCredentialMaterialStore({ records });
}

function withSqliteStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "data-plane-agent-store-"));
  let store;
  try {
    store = createSqliteSubscriptionControlStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    return fn(store);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function seedIssuedPortalOrder(store) {
  const now = "2026-06-10T00:00:00.000Z";
  const validUntil = VALID_UNTIL;
  store.createAccount({
    id: "acct_agent_sqlite_1",
    ownerRef: "portal_user_agent_sqlite_1",
    status: "active",
    createdAt: now,
    updatedAt: now,
    metadata: { source: "agent_test" }
  });
  store.createEntitlement({
    id: "ent_agent_sqlite_1",
    accountId: "acct_agent_sqlite_1",
    plan: "monthly",
    status: "active",
    validFrom: now,
    validUntil,
    trafficLimitBytes: 1024,
    createdAt: now,
    updatedAt: now
  });
  store.createIssuanceRequest({
    id: "pareq_agent_sqlite_1",
    accountId: "acct_agent_sqlite_1",
    entitlementId: "ent_agent_sqlite_1",
    approvalRef: "approval_agent_sqlite_1",
    status: "issued",
    quantity: 1,
    nodeId: "channel-sgp-a-hy2",
    purpose: "portal_auto_issuance",
    requestedByRef: "portal_auto_issuer",
    createdAt: now,
    updatedAt: now
  });
  store.linkIssuedSubscription({
    id: "link_agent_sqlite_1",
    requestId: "pareq_agent_sqlite_1",
    tenantRef: "tenant_agent_sqlite_1",
    artifactRef: "artifact_agent_sqlite_1",
    status: "active",
    createdAt: now,
    updatedAt: now
  });
  store.upsertPortalAccessRequest({
    id: "pareq_agent_sqlite_1",
    portalUserRef: "portal_user_agent_sqlite_1",
    plan: "monthly",
    clientTarget: "clash",
    durationDays: 30,
    quantity: 1,
    status: "delivered",
    nextAction: "user_can_use_access",
    noteProvided: false,
    priorTrialState: "not_applicable",
    submittedAt: now,
    updatedAt: now,
    reviewedAt: now,
    reviewedByRef: "portal_auto_issuer",
    expiresAt: validUntil,
    validUntil,
    entitlementRef: "ent_agent_sqlite_1",
    accessGrantRef: "grant_agent_sqlite_1",
    tenantId: "tenant_agent_sqlite_1",
    artifactId: "artifact_agent_sqlite_1",
    edgeCredentials: [
      {
        edgeChannelRef: "channel-sgp-a-hy2",
        edgeCredentialRef: "edgecred_agent_sqlite_hy2",
        edgeMaterialDigest: "sha256:aaaaaaaaaaaaaaaa"
      }
    ]
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

test("withholds revocation tombstones until the authenticated agent advertises compatible capabilities", () => {
  const tombstone = desired({
    channelRefs: ["channel-sgp-a-hy2"],
    edgeCredentialRefs: [],
    materialDigests: []
  });
  const service = serviceFor(fakeControlStore(new Map([
    ["channel-sgp-a-hy2", tombstone]
  ])));
  const identity = service.authenticate({ authorization: "Bearer node-agent-token" });

  const legacy = service.getDesiredState(identity, {
    agentVersion: "1.0",
    capabilities: []
  });
  assert.deepEqual(legacy.desiredStates, []);
  assert.equal(legacy.compatibility.tombstoneReconcile, false);
  assert.equal(legacy.compatibility.blockedDesiredStateCount, 1);

  const staleVersion = service.getDesiredState(identity, {
    agentVersion: "1.0",
    capabilities: ["empty_desired_state", "tombstone_reconcile"]
  });
  assert.deepEqual(staleVersion.desiredStates, []);
  assert.equal(staleVersion.compatibility.tombstoneReconcile, false);

  const compatible = service.getDesiredState(identity, {
    agentVersion: "1.1",
    capabilities: ["empty_desired_state", "tombstone_reconcile"]
  });
  assert.equal(compatible.desiredStates.length, 1);
  assert.deepEqual(compatible.desiredStates[0].edgeCredentialRefs, []);
  assert.equal(compatible.compatibility.tombstoneReconcile, true);
  assert.equal(compatible.compatibility.blockedDesiredStateCount, 0);
});

test("round-trips deterministic scoped tombstones for revoked credential filters", () => {
  const authoritative = desired({
    desiredStateRef: "desired_sgp_other_hy2_001",
    generation: "gen_sgp_other_hy2_001",
    channelRefs: ["channel-sgp-a-hy2"],
    edgeCredentialRefs: ["edgecred_other_hy2"],
    materialDigests: [{
      channelRef: "channel-sgp-a-hy2",
      edgeCredentialRef: "edgecred_other_hy2",
      digest: "sha256:cccccccccccccccc"
    }]
  });
  const store = fakeControlStore(new Map([
    ["channel-sgp-a-hy2", authoritative]
  ]));
  const service = serviceFor(store);
  const identity = service.authenticate({ authorization: "Bearer node-agent-token" });
  const credentialFilter = {
    edgeCredentialRefs: ["edgecred_revoked_hy2"]
  };

  const legacy = service.getDesiredState(identity, {
    ...credentialFilter,
    agentVersion: "1.0",
    capabilities: []
  });
  assert.deepEqual(legacy.desiredStates, []);
  assert.equal(legacy.compatibility.tombstoneReconcile, false);
  assert.equal(legacy.compatibility.blockedDesiredStateCount, 1);

  const compatibleFilter = {
    ...credentialFilter,
    agentVersion: "1.1",
    capabilities: ["empty_desired_state", "tombstone_reconcile"]
  };
  const first = service.getDesiredState(identity, compatibleFilter);
  const second = service.getDesiredState(identity, compatibleFilter);

  assert.equal(first.desiredStates.length, 1);
  const [scoped] = first.desiredStates;
  assert.match(scoped.desiredStateRef, /^desired_scoped_/);
  assert.match(scoped.generation, /^gen_scoped_/);
  assert.deepEqual(scoped.channelRefs, ["channel-sgp-a-hy2"]);
  assert.deepEqual(scoped.edgeCredentialRefs, []);
  assert.deepEqual(scoped.materialDigests, []);
  assert.equal(first.compatibility.tombstoneReconcile, true);
  assert.equal(first.compatibility.blockedDesiredStateCount, 0);
  assert.equal(second.desiredStates[0].desiredStateRef, scoped.desiredStateRef);
  assert.equal(second.desiredStates[0].generation, scoped.generation);
  assert.doesNotMatch(JSON.stringify(first), /edgecred_(?:other|revoked)_hy2/);

  assert.throws(
    () => service.recordReceipt(identity, receipt({
      desiredStateRef: "desired_scoped_client_supplied",
      generation: scoped.generation,
      credentialCount: 0,
      materialDigests: []
    })),
    (error) => {
      assert.equal(error.code, "desired_state_not_found");
      const safeError = service.safeErrorPayload(error);
      assert.deepEqual(safeError, {
        error: "desired_state_not_found",
        message: "desired_state_not_found",
        redacted: true
      });
      assert.doesNotMatch(JSON.stringify(safeError), /edgecred_(?:other|revoked)_hy2|client_supplied/);
      return true;
    }
  );
  assert.equal(store.receipts.length, 0);

  assert.throws(
    () => service.recordReceipt(identity, receipt({
      desiredStateRef: scoped.desiredStateRef,
      generation: scoped.generation,
      credentialCount: 1,
      materialDigests: []
    })),
    (error) => {
      assert.equal(error.code, "desired_state_receipt_mismatch");
      assert.deepEqual(service.safeErrorPayload(error), {
        error: "desired_state_receipt_mismatch",
        message: "desired_state_receipt_mismatch",
        redacted: true
      });
      return true;
    }
  );
  assert.equal(store.receipts.length, 0);

  const receiptResponse = service.recordReceipt(identity, receipt({
    desiredStateRef: scoped.desiredStateRef,
    generation: scoped.generation,
    credentialCount: 0,
    materialDigests: []
  }));

  assert.equal(receiptResponse.generation, scoped.generation);
  assert.equal(store.receipts.length, 1);
  assert.equal(store.receipts[0].desiredStateRef, scoped.desiredStateRef);
  assert.equal(store.receipts[0].generation, scoped.generation);
  assert.equal(store.receipts[0].actionCounts.add, 0);
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
  assert.equal(store.receipts[0].listenerUdp443, true);
});

test("returns node-scoped material summaries and material records for current desired state only", () => {
  const store = fakeControlStore(new Map([
    ["channel-sgp-a-hy2", desired({ desiredStateRef: "desired_sgp_hy2_001" })]
  ]));
  const materialStore = materialStoreFor([
    {
      credentialRef: "edgecred_safe_hy2",
      materialDigest: "sha256:aaaaaaaaaaaaaaaa",
      material: {
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "synthetic-hy2-material"
      }
    }
  ]);
  const service = serviceFor(store, { credentialMaterialStore: materialStore });
  const identity = service.authenticate({ authorization: "Bearer node-agent-token" });

  const summary = service.getCredentialMaterials(identity, {
    type: "gccgw_data_plane_material_request",
    nodeRef: "node-sgp-a",
    desiredStateRef: "desired_sgp_hy2_001",
    edgeCredentialRefs: ["edgecred_safe_hy2"],
    mode: "summary"
  });
  assert.equal(summary.mode, "summary");
  assert.equal(summary.redacted, true);
  assert.deepEqual(summary.records, [{
    edgeCredentialRef: "edgecred_safe_hy2",
    materialDigest: "sha256:aaaaaaaaaaaaaaaa",
    hasMaterial: true
  }]);
  assert.doesNotMatch(JSON.stringify(summary), /synthetic-hy2-material|11111111/i);

  const material = service.getCredentialMaterials(identity, {
    type: "gccgw_data_plane_material_request",
    nodeRef: "node-sgp-a",
    desiredStateRef: "desired_sgp_hy2_001",
    edgeCredentialRefs: ["edgecred_safe_hy2"],
    mode: "material"
  });
  assert.equal(material.mode, "material");
  assert.equal(material.sensitive, true);
  assert.equal(material.records[0].edgeCredentialRef, "edgecred_safe_hy2");
  assert.deepEqual(material.records[0].material, {
    uuid: "11111111-1111-4111-8111-111111111111",
    password: "synthetic-hy2-material"
  });
});

test("scopes desired-state, material, and receipts to selected edge credentials for smoke apply", () => {
  const aggregate = desired({
    desiredStateRef: "desired_aggregate_sgp_001",
    generation: "gen_aggregate_001",
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
    ]
  });
  const store = fakeControlStore(new Map([
    ["channel-sgp-a-hy2", aggregate],
    ["channel-sgp-a-tuic", aggregate]
  ]));
  const materialStore = materialStoreFor([
    {
      credentialRef: "edgecred_safe_hy2",
      materialDigest: "sha256:aaaaaaaaaaaaaaaa",
      material: {
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "synthetic-hy2-material"
      }
    },
    {
      credentialRef: "edgecred_safe_tuic",
      materialDigest: "sha256:bbbbbbbbbbbbbbbb",
      material: {
        uuid: "22222222-2222-4222-8222-222222222222",
        password: "synthetic-tuic-material"
      }
    }
  ]);
  const service = serviceFor(store, { credentialMaterialStore: materialStore });
  const identity = service.authenticate({ authorization: "Bearer node-agent-token" });

  const response = service.getDesiredState(identity, {
    edgeCredentialRefs: ["edgecred_safe_hy2"]
  });

  assert.equal(response.desiredStates.length, 1);
  const [scoped] = response.desiredStates;
  assert.notEqual(scoped.desiredStateRef, aggregate.desiredStateRef);
  assert.notEqual(scoped.generation, aggregate.generation);
  assert.match(scoped.desiredStateRef, /^desired_scoped_/);
  assert.match(scoped.generation, /^gen_scoped_/);
  assert.deepEqual(scoped.edgeCredentialRefs, ["edgecred_safe_hy2"]);
  assert.deepEqual(scoped.materialDigests, [{
    channelRef: "channel-sgp-a-hy2",
    edgeCredentialRef: "edgecred_safe_hy2",
    digest: "sha256:aaaaaaaaaaaaaaaa"
  }]);

  const material = service.getCredentialMaterials(identity, {
    type: "gccgw_data_plane_material_request",
    nodeRef: "node-sgp-a",
    desiredStateRef: scoped.desiredStateRef,
    edgeCredentialRefs: ["edgecred_safe_hy2"],
    mode: "material"
  });
  assert.equal(material.desiredStateRef, scoped.desiredStateRef);
  assert.equal(material.records.length, 1);
  assert.equal(material.records[0].edgeCredentialRef, "edgecred_safe_hy2");

  assert.throws(
    () => service.recordReceipt(identity, receipt({
      desiredStateRef: scoped.desiredStateRef,
      generation: scoped.generation,
      channelRef: "channel-sgp-a-hy2",
      credentialCount: 1,
      materialDigests: [
        "sha256:aaaaaaaaaaaaaaaa",
        "sha256:dddddddddddddddd"
      ]
    })),
    (error) => error.code === "desired_state_receipt_mismatch"
  );
  assert.equal(store.receipts.length, 0);

  const receiptResponse = service.recordReceipt(identity, receipt({
    desiredStateRef: scoped.desiredStateRef,
    generation: scoped.generation,
    channelRef: "channel-sgp-a-hy2",
    credentialCount: 1,
    materialDigests: ["sha256:aaaaaaaaaaaaaaaa"]
  }));

  assert.equal(receiptResponse.generation, scoped.generation);
  assert.equal(store.receipts.length, 1);
  assert.equal(store.receipts[0].desiredStateRef, scoped.desiredStateRef);
  assert.equal(store.receipts[0].generation, scoped.generation);
  assert.equal(store.receipts[0].actionCounts.add, 1);
});

test("rejects material requests outside node, desired-state, digest, and credential scope", () => {
  const store = fakeControlStore(new Map([
    ["channel-sgp-a-hy2", desired({ desiredStateRef: "desired_sgp_hy2_001" })]
  ]));
  const materialStore = materialStoreFor([
    {
      credentialRef: "edgecred_safe_hy2",
      materialDigest: "sha256:stale_digest",
      material: {
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "synthetic-hy2-material"
      }
    }
  ]);
  const service = serviceFor(store, { credentialMaterialStore: materialStore });
  const identity = service.authenticate({ authorization: "Bearer node-agent-token" });

  assert.throws(
    () => service.getCredentialMaterials(identity, {
      nodeRef: "node-other",
      desiredStateRef: "desired_sgp_hy2_001",
      edgeCredentialRefs: ["edgecred_safe_hy2"],
      mode: "summary"
    }),
    (error) => error.code === "node_scope_mismatch"
  );

  assert.throws(
    () => service.getCredentialMaterials(identity, {
      nodeRef: "node-sgp-a",
      desiredStateRef: "desired_missing",
      edgeCredentialRefs: ["edgecred_safe_hy2"],
      mode: "summary"
    }),
    (error) => error.code === "desired_state_not_found"
  );

  assert.throws(
    () => service.getCredentialMaterials(identity, {
      nodeRef: "node-sgp-a",
      desiredStateRef: "desired_sgp_hy2_001",
      edgeCredentialRefs: ["edgecred_other"],
      mode: "summary"
    }),
    (error) => error.code === "edge_credential_scope_mismatch"
  );

  assert.throws(
    () => service.getCredentialMaterials(identity, {
      nodeRef: "node-sgp-a",
      desiredStateRef: "desired_sgp_hy2_001",
      edgeCredentialRefs: ["edgecred_safe_hy2"],
      mode: "summary"
    }),
    (error) => error.code === "material_digest_mismatch"
  );
});

test("material requests fail safely when protected material store is unavailable", () => {
  const store = fakeControlStore(new Map([
    ["channel-sgp-a-hy2", desired({ desiredStateRef: "desired_sgp_hy2_001" })]
  ]));
  const service = serviceFor(store);
  const identity = service.authenticate({ authorization: "Bearer node-agent-token" });

  assert.throws(
    () => service.getCredentialMaterials(identity, {
      nodeRef: "node-sgp-a",
      desiredStateRef: "desired_sgp_hy2_001",
      edgeCredentialRefs: ["edgecred_safe_hy2"],
      mode: "summary"
    }),
    (error) => error.code === "material_store_unavailable" && error.statusCode === 503
  );
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

test("repeated tombstone receipts remain idempotent and do not create a second mutation record", () => {
  const tombstone = desired({
    desiredStateRef: "desired_sgp_tombstone_001",
    generation: "gen_sgp_tombstone_001",
    edgeCredentialRefs: [],
    materialDigests: []
  });
  const store = fakeControlStore(new Map([
    ["channel-sgp-a-hy2", tombstone]
  ]));
  const service = serviceFor(store);
  const identity = service.authenticate({ authorization: "Bearer node-agent-token" });
  const appliedTombstone = receipt({
    desiredStateRef: tombstone.desiredStateRef,
    generation: tombstone.generation,
    credentialCount: 0,
    materialDigests: [],
    actionCounts: { add: 0, revoke: 1, rotate: 0, unchanged: 0 },
    status: "applied"
  });

  const first = service.recordReceipt(identity, appliedTombstone);
  const second = service.recordReceipt(identity, {
    ...appliedTombstone,
    status: "unchanged",
    actionCounts: { add: 0, revoke: 0, rotate: 0, unchanged: 0 },
    appliedAt: "2026-06-10T00:02:00.000Z"
  });

  assert.equal(first.receiptId, second.receiptId);
  assert.equal(second.status, "applied");
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

test("requires exact authoritative material completeness for ordinary applied and unchanged receipts", () => {
  withSqliteStore((store) => {
    seedIssuedPortalOrder(store);
    const service = createDataPlaneAgentService({
      controlStore: store,
      nodes: [
        {
          nodeRef: "node-sgp-a",
          channelRefs: ["channel-sgp-a-hy2"],
          tokenSha256: hashDataPlaneAgentToken("node-agent-token")
        }
      ],
      nowFn: () => NOW
    });
    const identity = service.authenticate({ authorization: "Bearer node-agent-token" });
    const [desiredState] = service.getDesiredState(identity).desiredStates;
    store.recordEdgeDesiredStateNotification({
      id: "edge_state_notify_agent_unscoped_completeness",
      nodeRef: "node-sgp-a",
      channelRef: "channel-sgp-a-hy2",
      desiredStateRef: desiredState.desiredStateRef,
      generation: desiredState.generation,
      reason: "order_refreshed",
      status: "pending",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString()
    });

    const invalidVariants = [
      { name: "wrong_count", credentialCount: 0, materialDigests: ["sha256:aaaaaaaaaaaaaaaa"] },
      { name: "missing_digest", credentialCount: 1, materialDigests: [] },
      {
        name: "extra_digest",
        credentialCount: 1,
        materialDigests: ["sha256:aaaaaaaaaaaaaaaa", "sha256:bbbbbbbbbbbbbbbb"]
      },
      {
        name: "duplicate_digest",
        credentialCount: 1,
        materialDigests: ["sha256:aaaaaaaaaaaaaaaa", "sha256:aaaaaaaaaaaaaaaa"]
      }
    ];
    for (const status of ["applied", "unchanged"]) {
      for (const variant of invalidVariants) {
        assert.throws(
          () => service.recordReceipt(identity, {
            type: "gccgw_data_plane_apply_receipt",
            nodeRef: "node-sgp-a",
            desiredStateRef: `client_supplied_${variant.name}`,
            generation: desiredState.generation,
            channelRef: "channel-sgp-a-hy2",
            status,
            configTest: true,
            serviceActive: true,
            listenerPresent: true,
            credentialCount: variant.credentialCount,
            materialDigests: variant.materialDigests,
            appliedAt: "2026-06-10T00:01:00.000Z"
          }),
          (error) => error.code === "desired_state_receipt_mismatch"
        );
      }
    }

    assert.equal(store.listEdgeApplyReceipts({ channelRef: "channel-sgp-a-hy2" }).length, 0);
    assert.equal(
      store.listEdgeDesiredStateNotifications({ channelRef: "channel-sgp-a-hy2" })[0].status,
      "pending"
    );

    const applied = service.recordReceipt(identity, {
      type: "gccgw_data_plane_apply_receipt",
      nodeRef: "node-sgp-a",
      desiredStateRef: "client_supplied_wrong_ref",
      generation: desiredState.generation,
      channelRef: "channel-sgp-a-hy2",
      status: "applied",
      configTest: true,
      serviceActive: true,
      listenerPresent: true,
      credentialCount: 1,
      materialDigests: ["sha256:aaaaaaaaaaaaaaaa"],
      appliedAt: "2026-06-10T00:02:00.000Z"
    });
    assert.equal(applied.status, "applied");
    assert.equal(store.listEdgeApplyReceipts({ channelRef: "channel-sgp-a-hy2" }).length, 1);
    assert.equal(
      store.listEdgeDesiredStateNotifications({ channelRef: "channel-sgp-a-hy2" })[0].status,
      "applied"
    );
  });
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

test("works with the durable sqlite control store contract", () => {
  withSqliteStore((store) => {
    seedIssuedPortalOrder(store);
    const service = createDataPlaneAgentService({
      controlStore: store,
      nodes: [
        {
          nodeRef: "node-sgp-a",
          channelRefs: ["channel-sgp-a-hy2"],
          tokenSha256: hashDataPlaneAgentToken("node-agent-token")
        }
      ],
      nowFn: () => NOW
    });
    const identity = service.authenticate({ authorization: "Bearer node-agent-token" });

    const desiredResponse = service.getDesiredState(identity);
    assert.equal(desiredResponse.desiredStates.length, 1);
    const [desiredState] = desiredResponse.desiredStates;
    assert.equal(desiredState.nodeRef, "node-sgp-a");
    assert.deepEqual(desiredState.edgeCredentialRefs, ["edgecred_agent_sqlite_hy2"]);
    store.recordEdgeDesiredStateNotification({
      id: "edge_state_notify_agent_sqlite_hy2",
      nodeRef: "node-sgp-a",
      channelRef: "channel-sgp-a-hy2",
      desiredStateRef: desiredState.desiredStateRef,
      generation: desiredState.generation,
      reason: "order_delivered",
      status: "pending",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString()
    });

    const lease = service.recordLease(identity, {
      channelRef: "channel-sgp-a-hy2",
      agentRef: "agent-sgp-a"
    });
    assert.equal(lease.status, "active");
    assert.equal(lease.redacted, true);

    const receiptResponse = service.recordReceipt(identity, {
      type: "gccgw_data_plane_apply_receipt",
      nodeRef: "node-sgp-a",
      generation: desiredState.generation,
      channelRef: "channel-sgp-a-hy2",
      status: "applied",
      configTest: true,
      serviceActive: true,
      listenerPresent: true,
      credentialCount: 1,
      appliedAt: "2026-06-10T00:01:00.000Z",
      materialDigests: ["sha256:aaaaaaaaaaaaaaaa"]
    });
    assert.equal(receiptResponse.status, "applied");

    const receipts = store.listEdgeApplyReceipts({ channelRef: "channel-sgp-a-hy2" });
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].listenerUdp443, true);
    assert.equal(receipts[0].serviceActive, true);
    assert.equal(receipts[0].configTestOk, true);
    const notifications = store.listEdgeDesiredStateNotifications({
      channelRef: "channel-sgp-a-hy2"
    });
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].status, "applied");
  });
});
