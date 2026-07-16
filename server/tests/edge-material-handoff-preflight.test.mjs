import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";
import { buildProtectedMaterialHandoffPreflight } from "../services/edge/material-handoff-preflight.mjs";
import { createReadOnlyMaterialHandoffControlStore } from "../services/edge/material-handoff-readonly-control-store.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

const NOW = "2026-06-13T12:00:00.000Z";
const VALID_UNTIL = "2099-07-13T12:00:00.000Z";

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "edge-material-handoff-"));
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

function seedRegisteredNode(store, overrides = {}) {
  return store.upsertEdgeRegisteredNode({
    nodeRef: "edge-node-sgp-a",
    providerRef: "provider-vultr",
    regionRef: "region-sgp",
    roleRef: "data-plane",
    channelRefs: [
      "channel-sgp-a-hy2",
      "channel-sgp-a-tuic"
    ],
    imageManifestRef: "node-image-manifest-20260613",
    releaseRef: "release-node-image-20260613",
    lifecycle: "registered",
    status: "active",
    firstBootPacketRef: "first_boot_sgp_a_20260613",
    registeredAt: NOW,
    updatedAt: NOW,
    metadata: { source: "test" },
    ...overrides
  });
}

function seedDeliveredOrder(store) {
  store.createAccount({
    id: "acct_material_handoff_1",
    ownerRef: "portal_user_material_handoff_1",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    metadata: { source: "test" }
  });
  store.createEntitlement({
    id: "ent_material_handoff_1",
    accountId: "acct_material_handoff_1",
    plan: "monthly",
    status: "active",
    validFrom: NOW,
    validUntil: VALID_UNTIL,
    trafficLimitBytes: 1024,
    createdAt: NOW,
    updatedAt: NOW
  });
  return store.upsertPortalAccessRequest({
    id: "pareq_material_handoff_1",
    portalUserRef: "portal_user_material_handoff_1",
    plan: "monthly",
    clientTarget: "clash",
    durationDays: 30,
    quantity: 1,
    status: "delivered",
    nextAction: "user_can_use_access",
    noteProvided: false,
    priorTrialState: "not_applicable",
    submittedAt: NOW,
    updatedAt: NOW,
    reviewedAt: NOW,
    reviewedByRef: "portal_auto_issuer",
    expiresAt: VALID_UNTIL,
    validUntil: VALID_UNTIL,
    entitlementRef: "ent_material_handoff_1",
    accessGrantRef: "grant_material_handoff_1",
    tenantId: "tenant_material_handoff_1",
    artifactId: "artifact_material_handoff_1",
    edgeCredentials: [
      {
        edgeChannelRef: "channel-sgp-a-hy2",
        edgeCredentialRef: "edgecred_material_handoff_hy2",
        edgeMaterialDigest: "sha256:aaaaaaaaaaaaaaaa"
      },
      {
        edgeChannelRef: "channel-sgp-a-tuic",
        edgeCredentialRef: "edgecred_material_handoff_tuic",
        edgeMaterialDigest: "sha256:bbbbbbbbbbbbbbbb"
      }
    ]
  });
}

function materialStore(records = []) {
  return createEdgeCredentialMaterialStore({ records });
}

test("material handoff preflight summarizes registered node readiness without protected material", () => {
  withStore((store) => {
    seedRegisteredNode(store);
    seedDeliveredOrder(store);
    const protectedMaterials = materialStore([
      {
        credentialRef: "edgecred_material_handoff_hy2",
        materialDigest: "sha256:aaaaaaaaaaaaaaaa",
        material: {
          uuid: "11111111-1111-4111-8111-111111111111",
          password: "synthetic-hy2-password"
        }
      },
      {
        credentialRef: "edgecred_material_handoff_tuic",
        materialDigest: "sha256:bbbbbbbbbbbbbbbb",
        material: {
          uuid: "22222222-2222-4222-8222-222222222222",
          password: "synthetic-tuic-password"
        }
      }
    ]);

    const preflight = buildProtectedMaterialHandoffPreflight({
      controlStore: store,
      credentialMaterialStore: protectedMaterials,
      nodeRef: "edge-node-sgp-a"
    });

    assert.equal(preflight.type, "gccgw_protected_material_handoff_preflight");
    assert.equal(preflight.ready, true);
    assert.equal(preflight.status, "ready");
    assert.deepEqual(preflight.channelRefs, [
      "channel-sgp-a-hy2",
      "channel-sgp-a-tuic"
    ]);
    assert.equal(preflight.totals.desiredStateCount, 2);
    assert.equal(preflight.totals.edgeCredentialCount, 2);
    assert.equal(preflight.totals.materialReadyCount, 2);
    assert.equal(preflight.totals.missingMaterialCount, 0);
    assert.equal(preflight.totals.digestMismatchCount, 0);
    assert.deepEqual(preflight.blockers, []);
    assert.equal(preflight.desiredStates.length, 2);
    assert.doesNotMatch(
      JSON.stringify(preflight),
      /synthetic-|11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222/
    );
  });
});

test("material handoff preflight can read an existing control DB without opening the mutable store", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "edge-material-handoff-readonly-"));
  const dbPath = join(tempDir, "control.sqlite");
  let mutableStore;
  let readOnlyStore;
  try {
    mutableStore = createSqliteSubscriptionControlStore({ dbPath });
    seedRegisteredNode(mutableStore);
    seedDeliveredOrder(mutableStore);
    mutableStore.close();
    mutableStore = null;

    readOnlyStore = createReadOnlyMaterialHandoffControlStore({ dbPath });
    const protectedMaterials = materialStore([
      {
        credentialRef: "edgecred_material_handoff_hy2",
        materialDigest: "sha256:aaaaaaaaaaaaaaaa",
        material: {
          uuid: "11111111-1111-4111-8111-111111111111",
          password: "synthetic-hy2-password"
        }
      },
      {
        credentialRef: "edgecred_material_handoff_tuic",
        materialDigest: "sha256:bbbbbbbbbbbbbbbb",
        material: {
          uuid: "22222222-2222-4222-8222-222222222222",
          password: "synthetic-tuic-password"
        }
      }
    ]);

    const preflight = buildProtectedMaterialHandoffPreflight({
      controlStore: readOnlyStore,
      credentialMaterialStore: protectedMaterials,
      nodeRef: "edge-node-sgp-a"
    });

    assert.equal(preflight.ready, true);
    assert.equal(preflight.totals.materialReadyCount, 2);
    assert.doesNotMatch(
      JSON.stringify(preflight),
      /synthetic-|11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222/
    );
  } finally {
    readOnlyStore?.close();
    mutableStore?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("read-only material handoff mirrors deterministic tombstones after final credentials are disabled", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "edge-material-handoff-readonly-tombstone-"));
  const dbPath = join(tempDir, "control.sqlite");
  let mutableStore;
  let readOnlyStore;
  try {
    mutableStore = createSqliteSubscriptionControlStore({ dbPath });
    seedRegisteredNode(mutableStore);
    const delivered = seedDeliveredOrder(mutableStore);
    const channelRefs = [
      "channel-sgp-a-hy2",
      "channel-sgp-a-tuic"
    ];
    const activeStates = channelRefs.map((channelRef) => (
      mutableStore.getLatestEdgeDesiredStateForChannel(channelRef, {
        nodeRef: "edge-node-sgp-a"
      })
    ));
    assert.deepEqual(
      activeStates.map((desiredState) => desiredState.edgeCredentialRefs),
      [
        ["edgecred_material_handoff_hy2"],
        ["edgecred_material_handoff_tuic"]
      ]
    );

    mutableStore.upsertPortalAccessRequest({
      ...delivered,
      status: "disabled",
      nextAction: "traffic_supply_suspended_quota",
      subscriptionUrl: null,
      updatedAt: "2026-06-13T12:01:00.000Z"
    });
    const mutableTombstones = channelRefs.map((channelRef) => (
      mutableStore.getLatestEdgeDesiredStateForChannel(channelRef, {
        nodeRef: "edge-node-sgp-a"
      })
    ));
    for (const [index, tombstone] of mutableTombstones.entries()) {
      assert.ok(tombstone);
      assert.deepEqual(tombstone.edgeCredentialRefs, []);
      assert.deepEqual(tombstone.materialDigests, []);
      assert.notEqual(tombstone.desiredStateRef, activeStates[index].desiredStateRef);
    }
    mutableStore.close();
    mutableStore = null;

    readOnlyStore = createReadOnlyMaterialHandoffControlStore({ dbPath });
    const readOnlyTombstones = channelRefs.map((channelRef) => (
      readOnlyStore.getLatestEdgeDesiredStateForChannel(channelRef, {
        nodeRef: "edge-node-sgp-a"
      })
    ));
    assert.deepEqual(readOnlyTombstones, mutableTombstones);
    for (const [index, tombstone] of readOnlyTombstones.entries()) {
      const repeated = readOnlyStore.getLatestEdgeDesiredStateForChannel(channelRefs[index], {
        nodeRef: "edge-node-sgp-a"
      });
      assert.equal(repeated.desiredStateRef, tombstone.desiredStateRef);
      assert.equal(repeated.generation, tombstone.generation);
    }
    assert.equal(
      readOnlyStore.getLatestEdgeDesiredStateForChannel("channel-never-seen", {
        nodeRef: "edge-node-sgp-a"
      }),
      null
    );

    const preflight = buildProtectedMaterialHandoffPreflight({
      controlStore: readOnlyStore,
      credentialMaterialStore: materialStore(),
      nodeRef: "edge-node-sgp-a"
    });
    assert.equal(preflight.ready, true);
    assert.equal(preflight.status, "ready");
    assert.equal(preflight.totals.desiredStateCount, 2);
    assert.equal(preflight.totals.edgeCredentialCount, 0);
    assert.equal(preflight.totals.materialReadyCount, 0);
    assert.equal(preflight.totals.missingMaterialCount, 0);
    assert.equal(preflight.totals.digestMismatchCount, 0);
    assert.deepEqual(preflight.blockers, []);
  } finally {
    readOnlyStore?.close();
    mutableStore?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("read-only material handoff keeps an active credential beside disabled channel history", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "edge-material-handoff-readonly-active-history-"));
  const dbPath = join(tempDir, "control.sqlite");
  let mutableStore;
  let readOnlyStore;
  try {
    mutableStore = createSqliteSubscriptionControlStore({ dbPath });
    const delivered = seedDeliveredOrder(mutableStore);
    mutableStore.upsertPortalAccessRequest({
      ...delivered,
      status: "disabled",
      nextAction: "traffic_supply_suspended_quota",
      subscriptionUrl: null,
      updatedAt: "2026-06-13T12:01:00.000Z"
    });
    mutableStore.upsertPortalAccessRequest({
      ...delivered,
      id: "pareq_material_handoff_active_2",
      status: "delivered",
      nextAction: "user_can_use_access",
      accessGrantRef: "grant_material_handoff_active_2",
      artifactId: "artifact_material_handoff_active_2",
      edgeChannelRef: "channel-sgp-a-hy2",
      edgeCredentialRef: "edgecred_material_handoff_hy2_active",
      edgeMaterialDigest: "sha256:cccccccccccccccc",
      edgeCredentials: [
        {
          edgeChannelRef: "channel-sgp-a-hy2",
          edgeCredentialRef: "edgecred_material_handoff_hy2_active",
          edgeMaterialDigest: "sha256:cccccccccccccccc"
        }
      ],
      updatedAt: "2026-06-13T12:02:00.000Z"
    });
    const mutableProjection = mutableStore.getLatestEdgeDesiredStateForChannel("channel-sgp-a-hy2", {
      nodeRef: "edge-node-sgp-a"
    });
    mutableStore.close();
    mutableStore = null;

    readOnlyStore = createReadOnlyMaterialHandoffControlStore({ dbPath });
    const readOnlyProjection = readOnlyStore.getLatestEdgeDesiredStateForChannel("channel-sgp-a-hy2", {
      nodeRef: "edge-node-sgp-a"
    });
    assert.deepEqual(readOnlyProjection, mutableProjection);
    assert.deepEqual(readOnlyProjection.edgeCredentialRefs, ["edgecred_material_handoff_hy2_active"]);
    assert.deepEqual(readOnlyProjection.materialDigests, [
      {
        channelRef: "channel-sgp-a-hy2",
        edgeCredentialRef: "edgecred_material_handoff_hy2_active",
        digest: "sha256:cccccccccccccccc"
      }
    ]);
  } finally {
    readOnlyStore?.close();
    mutableStore?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("material handoff preflight fails closed when protected material is missing or mismatched", () => {
  withStore((store) => {
    seedRegisteredNode(store);
    seedDeliveredOrder(store);
    const protectedMaterials = materialStore([
      {
        credentialRef: "edgecred_material_handoff_hy2",
        materialDigest: "sha256:wrongdigest",
        material: {
          uuid: "33333333-3333-4333-8333-333333333333",
          password: "synthetic-wrong-password"
        }
      }
    ]);

    const preflight = buildProtectedMaterialHandoffPreflight({
      controlStore: store,
      credentialMaterialStore: protectedMaterials,
      nodeRef: "edge-node-sgp-a"
    });

    assert.equal(preflight.ready, false);
    assert.equal(preflight.status, "blocked");
    assert.equal(preflight.totals.materialReadyCount, 0);
    assert.equal(preflight.totals.missingMaterialCount, 1);
    assert.equal(preflight.totals.digestMismatchCount, 1);
    assert.deepEqual(
      preflight.blockers.map((blocker) => blocker.code).sort(),
      ["material_digest_mismatch", "material_not_found"]
    );
    assert.doesNotMatch(JSON.stringify(preflight), /synthetic-wrong-password|33333333-3333-4333-8333-333333333333/);
  });
});

test("material handoff preflight blocks inactive or unregistered nodes without leaking refs beyond safe ids", () => {
  withStore((store) => {
    seedRegisteredNode(store, { status: "maintenance" });

    const inactive = buildProtectedMaterialHandoffPreflight({
      controlStore: store,
      credentialMaterialStore: materialStore(),
      nodeRef: "edge-node-sgp-a"
    });
    assert.equal(inactive.ready, false);
    assert.equal(inactive.status, "blocked");
    assert.deepEqual(inactive.blockers.map((blocker) => blocker.code), ["node_not_active"]);

    const missing = buildProtectedMaterialHandoffPreflight({
      controlStore: store,
      credentialMaterialStore: materialStore(),
      nodeRef: "edge-node-missing"
    });
    assert.equal(missing.ready, false);
    assert.equal(missing.status, "blocked");
    assert.deepEqual(missing.blockers.map((blocker) => blocker.code), ["node_not_registered"]);
  });
});
