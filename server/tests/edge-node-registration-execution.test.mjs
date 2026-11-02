import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildNodeImageFirstBootPacket } from "../services/node-image-first-boot-packet.mjs";
import {
  buildEdgeNodeRegistrationRecordFromFirstBootPacket,
  registrationBindingsEqual
} from "../services/edge/node-registration-ingestion.mjs";
import { executeEdgeNodeRegistration } from "../services/edge/node-registration-execution.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

const WG_FINGERPRINT = `sha256:${"a".repeat(64)}`;
const TOKEN_FINGERPRINT = `sha256:${"b".repeat(64)}`;
const ENABLED_ENV = { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: "true" };

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "edge-node-registration-execution-"));
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

function firstBootInput(overrides = {}) {
  return {
    generatedAt: "2026-11-02T10:00:00.000Z",
    node: {
      nodeRef: "node-vultr-jp-01",
      providerRef: "provider-vultr",
      regionRef: "region-nrt",
      roleRef: "data-plane",
      channelRefs: [
        "channel-vultr-jp-01-vless-reality-tcp",
        "channel-vultr-jp-01-hy2",
        "channel-vultr-jp-01-tuic"
      ]
    },
    image: {
      imageManifestRef: "node-image-manifest-jp01",
      releaseRef: "release-node-image-jp01",
      artifactSha256Recorded: true,
      noSecretImageConfirmed: true
    },
    controlPlane: {
      nodeRegistrationDryRunPassed: true,
      privateAgentRoutePlanned: true,
      protectedMaterialInjectPlanned: true,
      agentNodeIdentityPlanned: true
    },
    wireguard: {
      planRef: "wg-plan-gccgw-child-v1",
      tunnelAddressAssigned: true,
      hostKeyGenerationPlanned: true,
      peerPublicKeyExchangePlanned: true,
      toolsPinnedInImageManifest: true
    },
    runtime: {
      servicesDisabledInImage: true,
      xrayConfigTestPlanned: true,
      hysteria2ConfigTestPlanned: true,
      tuicConfigTestPlanned: true,
      statsLoopbackOnly: true
    },
    receiptGate: {
      desiredStatePullRequired: true,
      materialPullRequired: true,
      appliedReceiptRequired: true,
      renderWithholdsUntilReceipt: true
    },
    approval: {
      exactApprovalReceived: true,
      firstBootApplyApproved: true
    },
    ...overrides
  };
}

function approvedPacket(overrides = {}) {
  return buildNodeImageFirstBootPacket(firstBootInput(overrides));
}

function registration(overrides = {}) {
  return {
    wireguardPublicKeyFingerprint: WG_FINGERPRINT,
    agentAuthFingerprint: TOKEN_FINGERPRINT,
    firstBootPacketRef: "first_boot_node-vultr-jp-01",
    registeredAt: "2026-11-02T10:05:00.000Z",
    executedAt: "2026-11-02T10:05:01.000Z",
    ...overrides
  };
}

test("registration execution persists the node and issues a bound registration receipt", () => {
  withStore((store) => {
    const result = executeEdgeNodeRegistration({
      controlStore: store,
      firstBootPacket: approvedPacket(),
      registration: registration(),
      env: ENABLED_ENV
    });

    assert.equal(result.ok, true);
    assert.equal(result.outcome, "registered");
    assert.equal(result.record.nodeRef, "node-vultr-jp-01");
    assert.equal(result.record.metadata.wireguardPlanRef, "wg-plan-gccgw-child-v1");
    assert.equal(result.record.metadata.wireguardPublicKeyFingerprint, WG_FINGERPRINT);
    assert.equal(result.record.metadata.agentAuthFingerprint, TOKEN_FINGERPRINT);
    const persisted = store.getEdgeRegisteredNode("node-vultr-jp-01");
    assert.equal(persisted.metadata.wireguardPublicKeyFingerprint, WG_FINGERPRINT);
    assert.equal(persisted.metadata.agentAuthFingerprint, TOKEN_FINGERPRINT);

    const receipt = result.receipt;
    assert.equal(receipt.receiptKind, "node-registration");
    assert.equal(receipt.receiptRef, "node-registration:node-vultr-jp-01");
    assert.equal(receipt.outcome, "registered");
    assert.equal(receipt.nodeRef, "node-vultr-jp-01");
    assert.deepEqual(receipt.channelRefs, [
      "channel-vultr-jp-01-hy2",
      "channel-vultr-jp-01-tuic",
      "channel-vultr-jp-01-vless-reality-tcp"
    ]);
    assert.equal(receipt.firstBootPacketRef, "first_boot_node-vultr-jp-01");
    assert.equal(receipt.imageManifestRef, "node-image-manifest-jp01");
    assert.equal(receipt.releaseRef, "release-node-image-jp01");
    assert.equal(receipt.wireguardPlanRef, "wg-plan-gccgw-child-v1");
    assert.deepEqual(receipt.anchors, {
      wireguardPublicKeyFingerprint: WG_FINGERPRINT,
      agentAuthFingerprint: TOKEN_FINGERPRINT
    });
    assert.equal(receipt.registeredAt, "2026-11-02T10:05:00.000Z");
    assert.match(receipt.recordDigest, /^[0-9a-f]{64}$/);
    assert.equal(receipt.receiptGateRequired, true);
    assert.equal("desiredStateRef" in receipt, false);
    assert.doesNotMatch(JSON.stringify(receipt), /https?:|token=|password|203\.0\.113/);
  });
});

test("registration execution is idempotent for an identical binding", () => {
  withStore((store) => {
    const first = executeEdgeNodeRegistration({
      controlStore: store,
      firstBootPacket: approvedPacket(),
      registration: registration(),
      env: ENABLED_ENV
    });
    const second = executeEdgeNodeRegistration({
      controlStore: store,
      firstBootPacket: approvedPacket(),
      registration: registration({
        registeredAt: "2026-11-02T11:00:00.000Z",
        executedAt: "2026-11-02T11:00:01.000Z"
      }),
      env: ENABLED_ENV
    });

    assert.equal(second.outcome, "already-registered");
    assert.equal(second.receipt.receiptRef, first.receipt.receiptRef);
    assert.equal(second.receipt.recordDigest, first.receipt.recordDigest);
    assert.equal(second.receipt.registeredAt, "2026-11-02T10:05:00.000Z");
    assert.equal(store.listEdgeRegisteredNodes({}).length, 1);
    assert.equal(
      store.getEdgeRegisteredNode("node-vultr-jp-01").registeredAt,
      "2026-11-02T10:05:00.000Z"
    );
  });
});

test("registration execution refuses a conflicting re-registration binding", () => {
  withStore((store) => {
    executeEdgeNodeRegistration({
      controlStore: store,
      firstBootPacket: approvedPacket(),
      registration: registration(),
      env: ENABLED_ENV
    });

    const conflictingPacket = approvedPacket({
      node: {
        nodeRef: "node-vultr-jp-01",
        providerRef: "provider-vultr",
        regionRef: "region-nrt",
        roleRef: "data-plane",
        channelRefs: [
          "channel-vultr-jp-01-vless-reality-tcp",
          "channel-vultr-jp-01-hy2"
        ]
      }
    });

    assert.throws(
      () => executeEdgeNodeRegistration({
        controlStore: store,
        firstBootPacket: conflictingPacket,
        registration: registration(),
        env: ENABLED_ENV
      }),
      (error) => {
        assert.equal(error.code, "registration_conflict");
        return true;
      }
    );
    assert.deepEqual(store.getEdgeRegisteredNode("node-vultr-jp-01").channelRefs, [
      "channel-vultr-jp-01-vless-reality-tcp",
      "channel-vultr-jp-01-hy2",
      "channel-vultr-jp-01-tuic"
    ]);
  });
});

test("registration execution is disabled unless the gate value is exactly true", () => {
  withStore((store) => {
    for (const env of [
      {},
      { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: "false" },
      { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: "TRUE" },
      { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: "1" },
      { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: "yes" },
      { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: true },
      { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: new String("true") },
      { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: " true" },
      { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: "true " }
    ]) {
      assert.throws(
        () => executeEdgeNodeRegistration({
          controlStore: store,
          firstBootPacket: approvedPacket(),
          registration: registration(),
          env
        }),
        (error) => {
          assert.equal(error.code, "registration_execution_disabled");
          return true;
        }
      );
    }
    assert.equal(store.listEdgeRegisteredNodes({}).length, 0);

    const result = executeEdgeNodeRegistration({
      controlStore: store,
      firstBootPacket: approvedPacket(),
      registration: registration(),
      env: ENABLED_ENV
    });
    assert.equal(result.outcome, "registered");
  });
});

test("registration execution conflicts when the wireguard plan changes", () => {
  withStore((store) => {
    const first = executeEdgeNodeRegistration({
      controlStore: store,
      firstBootPacket: approvedPacket(),
      registration: registration(),
      env: ENABLED_ENV
    });

    const otherPlanPacket = approvedPacket({
      wireguard: {
        planRef: "wg-plan-gccgw-child-v2",
        tunnelAddressAssigned: true,
        hostKeyGenerationPlanned: true,
        peerPublicKeyExchangePlanned: true,
        toolsPinnedInImageManifest: true
      }
    });
    assert.throws(
      () => executeEdgeNodeRegistration({
        controlStore: store,
        firstBootPacket: otherPlanPacket,
        registration: registration(),
        env: ENABLED_ENV
      }),
      (error) => {
        assert.equal(error.code, "registration_conflict");
        return true;
      }
    );

    const replay = executeEdgeNodeRegistration({
      controlStore: store,
      firstBootPacket: approvedPacket(),
      registration: registration(),
      env: ENABLED_ENV
    });
    assert.equal(replay.outcome, "already-registered");
    assert.equal(replay.receipt.recordDigest, first.receipt.recordDigest);
    assert.equal(
      store.getEdgeRegisteredNode("node-vultr-jp-01").metadata.wireguardPlanRef,
      "wg-plan-gccgw-child-v1"
    );
  });
});

test("registration execution conflicts when an identity anchor changes", () => {
  withStore((store) => {
    const first = executeEdgeNodeRegistration({
      controlStore: store,
      firstBootPacket: approvedPacket(),
      registration: registration(),
      env: ENABLED_ENV
    });

    for (const changed of [
      { wireguardPublicKeyFingerprint: `sha256:${"c".repeat(64)}` },
      { agentAuthFingerprint: `sha256:${"d".repeat(64)}` }
    ]) {
      assert.throws(
        () => executeEdgeNodeRegistration({
          controlStore: store,
          firstBootPacket: approvedPacket(),
          registration: registration(changed),
          env: ENABLED_ENV
        }),
        (error) => {
          assert.equal(error.code, "registration_conflict");
          return true;
        }
      );
    }

    const persisted = store.getEdgeRegisteredNode("node-vultr-jp-01");
    assert.equal(persisted.metadata.wireguardPublicKeyFingerprint, WG_FINGERPRINT);
    assert.equal(persisted.metadata.agentAuthFingerprint, TOKEN_FINGERPRINT);
    assert.equal(persisted.registeredAt, first.receipt.registeredAt);
    assert.equal(store.listEdgeRegisteredNodes({}).length, 1);
  });
});

test("two stores on one database cannot overwrite an existing identity binding", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "edge-node-registration-race-"));
  const dbPath = join(tempDir, "control.sqlite");
  const storeA = createSqliteSubscriptionControlStore({ dbPath });
  const storeB = createSqliteSubscriptionControlStore({ dbPath });
  try {
    const first = executeEdgeNodeRegistration({
      controlStore: storeA,
      firstBootPacket: approvedPacket(),
      registration: registration(),
      env: ENABLED_ENV
    });
    assert.equal(first.outcome, "registered");

    // The same binding arriving through a second connection is idempotent.
    const replay = executeEdgeNodeRegistration({
      controlStore: storeB,
      firstBootPacket: approvedPacket(),
      registration: registration(),
      env: ENABLED_ENV
    });
    assert.equal(replay.outcome, "already-registered");
    assert.equal(replay.receipt.recordDigest, first.receipt.recordDigest);

    // A different binding through the second connection conflicts.
    const otherPlanPacket = approvedPacket({
      wireguard: {
        planRef: "wg-plan-gccgw-child-v2",
        tunnelAddressAssigned: true,
        hostKeyGenerationPlanned: true,
        peerPublicKeyExchangePlanned: true,
        toolsPinnedInImageManifest: true
      }
    });
    assert.throws(
      () => executeEdgeNodeRegistration({
        controlStore: storeB,
        firstBootPacket: otherPlanPacket,
        registration: registration(),
        env: ENABLED_ENV
      }),
      (error) => {
        assert.equal(error.code, "registration_conflict");
        return true;
      }
    );

    // The insert-only primitive itself refuses to overwrite an existing
    // row: called for a nodeRef that is already registered, it reports
    // the existing record back instead of replacing it. (A deterministic
    // stale-read interleaving is covered by the dedicated test below.)
    const winning = storeA.getEdgeRegisteredNode("node-vultr-jp-01");
    const rival = {
      ...winning,
      metadata: { ...winning.metadata, wireguardPlanRef: "wg-plan-gccgw-child-v2" }
    };
    const attempt = storeB.insertEdgeRegisteredNodeIfAbsent(rival);
    assert.equal(attempt.inserted, false);
    assert.equal(attempt.record.metadata.wireguardPlanRef, "wg-plan-gccgw-child-v1");

    // The winning binding is intact from both connections.
    assert.equal(
      storeB.getEdgeRegisteredNode("node-vultr-jp-01").metadata.wireguardPlanRef,
      "wg-plan-gccgw-child-v1"
    );
    const after = executeEdgeNodeRegistration({
      controlStore: storeA,
      firstBootPacket: approvedPacket(),
      registration: registration(),
      env: ENABLED_ENV
    });
    assert.equal(after.outcome, "already-registered");
    assert.equal(after.receipt.recordDigest, first.receipt.recordDigest);
    assert.equal(storeA.listEdgeRegisteredNodes({}).length, 1);
  } finally {
    storeA.close();
    storeB.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("insert-if-absent honors a stale absent read across two connections", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "edge-node-registration-stale-"));
  const dbPath = join(tempDir, "control.sqlite");
  const storeA = createSqliteSubscriptionControlStore({ dbPath });
  const storeB = createSqliteSubscriptionControlStore({ dbPath });
  try {
    // Both connections read first, and both observe the node as absent:
    // this is the stale read each racing writer would act on.
    assert.equal(storeA.getEdgeRegisteredNode("node-vultr-jp-01"), null);
    assert.equal(storeB.getEdgeRegisteredNode("node-vultr-jp-01"), null);

    const buildOptions = {
      firstBootPacketRef: "first_boot_node-vultr-jp-01",
      registeredAt: "2026-11-02T10:05:00.000Z",
      wireguardPublicKeyFingerprint: WG_FINGERPRINT,
      agentAuthFingerprint: TOKEN_FINGERPRINT
    };
    const recordA = buildEdgeNodeRegistrationRecordFromFirstBootPacket(approvedPacket(), buildOptions);
    const otherPlanPacket = approvedPacket({
      wireguard: {
        planRef: "wg-plan-gccgw-child-v2",
        tunnelAddressAssigned: true,
        hostKeyGenerationPlanned: true,
        peerPublicKeyExchangePlanned: true,
        toolsPinnedInImageManifest: true
      }
    });
    const recordB = buildEdgeNodeRegistrationRecordFromFirstBootPacket(otherPlanPacket, buildOptions);

    // Connection A wins the insert; connection B then acts on its stale
    // absent read with a different binding and must lose without
    // overwriting anything.
    const win = storeA.insertEdgeRegisteredNodeIfAbsent(recordA);
    assert.equal(win.inserted, true);
    const lose = storeB.insertEdgeRegisteredNodeIfAbsent(recordB);
    assert.equal(lose.inserted, false);
    assert.equal(registrationBindingsEqual(lose.record, recordA), true);
    assert.equal(lose.record.metadata.wireguardPlanRef, "wg-plan-gccgw-child-v1");
    assert.equal(storeB.listEdgeRegisteredNodes({}).length, 1);
  } finally {
    storeA.close();
    storeB.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("registration execution resolves the insert-loser branch for both outcomes", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "edge-node-registration-loser-"));
  const dbPath = join(tempDir, "control.sqlite");
  const storeA = createSqliteSubscriptionControlStore({ dbPath });
  const storeB = createSqliteSubscriptionControlStore({ dbPath });
  // A store facade whose first read is stale (reports the node as absent
  // although it is registered) forces the executor past its existing-
  // record check and into the insert attempt, deterministically covering
  // the race-loser branch (attempt.inserted === false).
  const staleFirstReadStore = (store) => {
    let stalePending = true;
    return {
      getEdgeRegisteredNode(nodeRef) {
        if (stalePending) {
          stalePending = false;
          return null;
        }
        return store.getEdgeRegisteredNode(nodeRef);
      },
      insertEdgeRegisteredNodeIfAbsent: (record) => store.insertEdgeRegisteredNodeIfAbsent(record),
      listEdgeRegisteredNodes: (filters) => store.listEdgeRegisteredNodes(filters)
    };
  };
  try {
    const first = executeEdgeNodeRegistration({
      controlStore: storeA,
      firstBootPacket: approvedPacket(),
      registration: registration(),
      env: ENABLED_ENV
    });
    assert.equal(first.outcome, "registered");

    // Loser with an identical binding: already-registered, same digest.
    const loserSame = executeEdgeNodeRegistration({
      controlStore: staleFirstReadStore(storeB),
      firstBootPacket: approvedPacket(),
      registration: registration(),
      env: ENABLED_ENV
    });
    assert.equal(loserSame.outcome, "already-registered");
    assert.equal(loserSame.receipt.recordDigest, first.receipt.recordDigest);

    // Loser with a different binding: registration_conflict.
    const otherPlanPacket = approvedPacket({
      wireguard: {
        planRef: "wg-plan-gccgw-child-v2",
        tunnelAddressAssigned: true,
        hostKeyGenerationPlanned: true,
        peerPublicKeyExchangePlanned: true,
        toolsPinnedInImageManifest: true
      }
    });
    assert.throws(
      () => executeEdgeNodeRegistration({
        controlStore: staleFirstReadStore(storeB),
        firstBootPacket: otherPlanPacket,
        registration: registration(),
        env: ENABLED_ENV
      }),
      (error) => {
        assert.equal(error.code, "registration_conflict");
        return true;
      }
    );

    assert.equal(storeB.listEdgeRegisteredNodes({}).length, 1);
    assert.equal(
      storeB.getEdgeRegisteredNode("node-vultr-jp-01").metadata.wireguardPlanRef,
      "wg-plan-gccgw-child-v1"
    );
  } finally {
    storeA.close();
    storeB.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("registration receipt executedAt is generated by the executor, never caller-supplied", () => {
  withStore((store) => {
    const before = Date.now();
    const result = executeEdgeNodeRegistration({
      controlStore: store,
      firstBootPacket: approvedPacket(),
      registration: registration({ executedAt: "yesterday" }),
      env: ENABLED_ENV
    });
    const after = Date.now();

    const executedMs = Date.parse(result.receipt.executedAt);
    assert.ok(Number.isFinite(executedMs));
    assert.equal(new Date(executedMs).toISOString(), result.receipt.executedAt);
    assert.ok(executedMs >= before - 1000 && executedMs <= after + 1000);
    assert.notEqual(result.receipt.executedAt, "yesterday");
  });
});

test("registration execution validates identity anchor fingerprints and the control store", () => {
  withStore((store) => {
    assert.throws(
      () => executeEdgeNodeRegistration({
        controlStore: store,
        firstBootPacket: approvedPacket(),
        registration: registration({ wireguardPublicKeyFingerprint: "not-a-fingerprint" }),
        env: ENABLED_ENV
      }),
      (error) => {
        assert.equal(error.code, "validation_error");
        return true;
      }
    );

    assert.throws(
      () => executeEdgeNodeRegistration({
        controlStore: store,
        firstBootPacket: approvedPacket(),
        registration: registration({ agentAuthFingerprint: "" }),
        env: ENABLED_ENV
      }),
      (error) => {
        assert.equal(error.code, "validation_error");
        return true;
      }
    );
  });

  assert.throws(
    () => executeEdgeNodeRegistration({
      firstBootPacket: approvedPacket(),
      registration: registration(),
      env: ENABLED_ENV
    }),
    (error) => {
      assert.equal(error.code, "validation_error");
      return true;
    }
  );
});
