import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildNodeImageFirstBootPacket } from "../services/node-image-first-boot-packet.mjs";
import {
  buildEdgeNodeRegistrationRecordFromFirstBootPacket,
  ingestEdgeNodeRegistrationFromFirstBootPacket
} from "../services/edge/node-registration-ingestion.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "edge-node-registration-"));
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
    generatedAt: "2026-06-13T12:00:00.000Z",
    node: {
      nodeRef: "edge-node-sgp-a",
      providerRef: "provider-vultr",
      regionRef: "region-sgp",
      roleRef: "data-plane",
      channelRefs: [
        "channel-sgp-a-vless-reality-tcp",
        "channel-sgp-a-hy2",
        "channel-sgp-a-tuic",
        "channel-sgp-a-hy2"
      ]
    },
    image: {
      imageManifestRef: "node-image-manifest-20260613",
      releaseRef: "release-node-image-20260613",
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

test("first-boot packet builds a safe durable node registration record", () => {
  const record = buildEdgeNodeRegistrationRecordFromFirstBootPacket(approvedPacket(), {
    firstBootPacketRef: "first_boot_sgp_a_20260613",
    registeredAt: "2026-06-13T12:30:00.000Z"
  });

  assert.deepEqual(record, {
    nodeRef: "edge-node-sgp-a",
    providerRef: "provider-vultr",
    regionRef: "region-sgp",
    roleRef: "data-plane",
    channelRefs: [
      "channel-sgp-a-vless-reality-tcp",
      "channel-sgp-a-hy2",
      "channel-sgp-a-tuic"
    ],
    imageManifestRef: "node-image-manifest-20260613",
    releaseRef: "release-node-image-20260613",
    lifecycle: "registered",
    status: "active",
    firstBootPacketRef: "first_boot_sgp_a_20260613",
    registeredAt: "2026-06-13T12:30:00.000Z",
    updatedAt: "2026-06-13T12:30:00.000Z",
    metadata: {
      source: "node-image-first-boot-packet",
      receiptGateRequired: true,
      imageSafeConfirmed: true,
      artifactHashRecorded: true,
      wireguardPlanRef: "wg-plan-gccgw-child-v1"
    }
  });
  assert.doesNotMatch(JSON.stringify(record), /https?:|token=|password|private|customer|203\.0\.113/);
});

test("first-boot packet ingestion persists the registered node in the control store", () => {
  withStore((store) => {
    const inserted = ingestEdgeNodeRegistrationFromFirstBootPacket({
      controlStore: store,
      firstBootPacket: approvedPacket(),
      firstBootPacketRef: "first_boot_sgp_a_20260613",
      registeredAt: "2026-06-13T12:30:00.000Z",
      env: { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: "true" }
    });

    assert.equal(inserted.nodeRef, "edge-node-sgp-a");
    assert.deepEqual(inserted.channelRefs, [
      "channel-sgp-a-vless-reality-tcp",
      "channel-sgp-a-hy2",
      "channel-sgp-a-tuic"
    ]);

    const fetched = store.getEdgeRegisteredNode("edge-node-sgp-a");
    assert.deepEqual(fetched, inserted);
    assert.deepEqual(store.listEdgeRegisteredNodes({ status: "active" }), [inserted]);
  });
});

test("first-boot packet ingestion refuses to write while the execution gate is closed", () => {
  withStore((store) => {
    for (const env of [
      {},
      { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: "false" },
      { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: "TRUE" },
      { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: true },
      { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: new String("true") }
    ]) {
      assert.throws(
        () => ingestEdgeNodeRegistrationFromFirstBootPacket({
          controlStore: store,
          firstBootPacket: approvedPacket(),
          firstBootPacketRef: "first_boot_sgp_a_20260613",
          registeredAt: "2026-06-13T12:30:00.000Z",
          env
        }),
        (error) => {
          assert.equal(error.code, "registration_execution_disabled");
          return true;
        }
      );
    }
    assert.equal(store.listEdgeRegisteredNodes({}).length, 0);
  });
});

test("first-boot packet ingestion refuses node-vultr-jp-01 with or without anchors", () => {
  withStore((store) => {
    const env = { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: "true" };
    const jp01Packet = buildNodeImageFirstBootPacket(firstBootInput({
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
      }
    }));

    // JP-01 registers only through the registration executor: this entry
    // refuses it before any store write, anchor-less or fully anchored.
    for (const anchors of [
      {},
      {
        wireguardPublicKeyFingerprint: `sha256:${"a".repeat(64)}`,
        agentAuthFingerprint: `sha256:${"b".repeat(64)}`
      }
    ]) {
      assert.throws(
        () => ingestEdgeNodeRegistrationFromFirstBootPacket({
          controlStore: store,
          firstBootPacket: jp01Packet,
          firstBootPacketRef: "first_boot_node-vultr-jp-01",
          registeredAt: "2026-11-02T10:05:00.000Z",
          env,
          ...anchors
        }),
        (error) => {
          assert.equal(error.code, "registration_path_forbidden");
          return true;
        }
      );
    }
    assert.equal(store.getEdgeRegisteredNode("node-vultr-jp-01"), null);
    assert.equal(store.listEdgeRegisteredNodes({}).length, 0);
  });
});

test("first-boot packet ingestion rejects malformed identity anchors and address plan refs", () => {
  withStore((store) => {
    const env = { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: "true" };
    const baseCall = {
      controlStore: store,
      firstBootPacket: approvedPacket(),
      firstBootPacketRef: "first_boot_sgp_a_20260613",
      registeredAt: "2026-06-13T12:30:00.000Z",
      env
    };

    // Malformed anchors are rejected by the shared builder validation,
    // on this entry just as on the executor entry.
    for (const anchors of [
      { wireguardPublicKeyFingerprint: "invalid", agentAuthFingerprint: `sha256:${"b".repeat(64)}` },
      { wireguardPublicKeyFingerprint: `sha256:${"a".repeat(64)}`, agentAuthFingerprint: "abc" }
    ]) {
      assert.throws(
        () => ingestEdgeNodeRegistrationFromFirstBootPacket({ ...baseCall, ...anchors }),
        (error) => {
          assert.equal(error.code, "validation_error");
          return true;
        }
      );
    }

    // A packet object carrying an address as its plan ref (bypassing the
    // packet builder) is rejected by the same dedicated plan-ref rule.
    for (const planRef of ["fd00::1", "fd00::/64", "10.77.0.2"]) {
      const packet = approvedPacket();
      packet.wireguard.planRef = planRef;
      assert.throws(
        () => ingestEdgeNodeRegistrationFromFirstBootPacket({ ...baseCall, firstBootPacket: packet }),
        (error) => {
          assert.equal(error.code, "validation_error");
          return true;
        }
      );
    }

    assert.equal(store.listEdgeRegisteredNodes({}).length, 0);
  });
});

test("first-boot packet ingestion never overwrites an established identity binding", () => {
  withStore((store) => {
    const env = { EDGE_NODE_REGISTRATION_EXECUTION_ENABLED: "true" };
    const anchored = {
      wireguardPublicKeyFingerprint: `sha256:${"a".repeat(64)}`,
      agentAuthFingerprint: `sha256:${"b".repeat(64)}`
    };
    const baseCall = {
      controlStore: store,
      firstBootPacket: approvedPacket(),
      firstBootPacketRef: "first_boot_sgp_a_20260613",
      registeredAt: "2026-06-13T12:30:00.000Z",
      env
    };

    const first = ingestEdgeNodeRegistrationFromFirstBootPacket({ ...baseCall, ...anchored });
    assert.equal(first.metadata.wireguardPublicKeyFingerprint, anchored.wireguardPublicKeyFingerprint);
    assert.equal(first.metadata.agentAuthFingerprint, anchored.agentAuthFingerprint);

    // An identical replay returns the stored record unchanged.
    const replay = ingestEdgeNodeRegistrationFromFirstBootPacket({ ...baseCall, ...anchored });
    assert.deepEqual(replay, first);

    // An anchor-less replay must not strip the stored anchors.
    assert.throws(
      () => ingestEdgeNodeRegistrationFromFirstBootPacket({ ...baseCall }),
      (error) => {
        assert.equal(error.code, "registration_conflict");
        return true;
      }
    );

    // A replay carrying a different anchor conflicts as well.
    assert.throws(
      () => ingestEdgeNodeRegistrationFromFirstBootPacket({
        ...baseCall,
        wireguardPublicKeyFingerprint: `sha256:${"c".repeat(64)}`,
        agentAuthFingerprint: anchored.agentAuthFingerprint
      }),
      (error) => {
        assert.equal(error.code, "registration_conflict");
        return true;
      }
    );

    const persisted = store.getEdgeRegisteredNode("edge-node-sgp-a");
    assert.equal(persisted.metadata.wireguardPublicKeyFingerprint, anchored.wireguardPublicKeyFingerprint);
    assert.equal(persisted.metadata.agentAuthFingerprint, anchored.agentAuthFingerprint);
    assert.equal(store.listEdgeRegisteredNodes({}).length, 1);
  });
});

test("registered node metadata rejects unsafe material values", () => {
  withStore((store) => {
    const record = buildEdgeNodeRegistrationRecordFromFirstBootPacket(approvedPacket(), {
      firstBootPacketRef: "first_boot_sgp_a_20260613",
      registeredAt: "2026-06-13T12:30:00.000Z"
    });

    assert.throws(
      () => store.upsertEdgeRegisteredNode({
        ...record,
        metadata: {
          ...record.metadata,
          diagnostic: "https://example.invalid/sub/clash.yaml"
        }
      }),
      (error) => {
        assert.equal(error.code, "validation_error");
        assert.doesNotMatch(error.message, /example\.invalid|clash\.yaml/);
        return true;
      }
    );
  });
});

test("first-boot packet ingestion requires the wireguard gates explicitly", () => {
  const packet = approvedPacket();
  packet.wireguard = {
    ...packet.wireguard,
    hostKeyGenerationPlanned: false
  };

  assert.throws(
    () => buildEdgeNodeRegistrationRecordFromFirstBootPacket(packet),
    (error) => {
      assert.equal(error.code, "precondition_failed");
      assert.doesNotMatch(error.message, /token|password|private|203\.0\.113/);
      return true;
    }
  );
});

test("first-boot packet ingestion refuses packets without explicit apply approval", () => {
  assert.throws(
    () => buildEdgeNodeRegistrationRecordFromFirstBootPacket(
      buildNodeImageFirstBootPacket(firstBootInput({
        approval: {
          exactApprovalReceived: true,
          firstBootApplyApproved: false
        }
      }))
    ),
    (error) => {
      assert.equal(error.code, "approval_required");
      assert.doesNotMatch(error.message, /token|password|private|203\.0\.113/);
      return true;
    }
  );
});
