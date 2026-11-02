import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
    physicalNodeRef: "edge-node-sgp-a",
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
    pool: "private",
    lifecycle: "private-validation",
    status: "inactive",
    firstBootPacketRef: "first_boot_sgp_a_20260613",
    registeredAt: "2026-06-13T12:30:00.000Z",
    updatedAt: "2026-06-13T12:30:00.000Z",
    metadata: {
      source: "node-image-first-boot-packet",
      receiptGateRequired: true,
      imageSafeConfirmed: true,
      artifactHashRecorded: true
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
      registeredAt: "2026-06-13T12:30:00.000Z"
    });

    assert.equal(inserted.nodeRef, "edge-node-sgp-a");
    assert.equal(inserted.physicalNodeRef, "edge-node-sgp-a");
    assert.equal(inserted.pool, "private");
    assert.equal(inserted.lifecycle, "private-validation");
    assert.equal(inserted.status, "inactive");
    assert.deepEqual(inserted.channelRefs, [
      "channel-sgp-a-vless-reality-tcp",
      "channel-sgp-a-hy2",
      "channel-sgp-a-tuic"
    ]);

    const fetched = store.getEdgeRegisteredNode("edge-node-sgp-a");
    assert.deepEqual(fetched, inserted);
    assert.deepEqual(store.listEdgeRegisteredNodes({ status: "inactive" }), [inserted]);
  });
});

test("registration CLI defaults to dry-run and only persists inactive private nodes with --apply", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "edge-node-registration-cli-"));
  const packetPath = join(tempDir, "first-boot-packet.json");
  const dbPath = join(tempDir, "control.sqlite");
  const cliPath = fileURLToPath(new URL("../../scripts/register-edge-node-from-first-boot-packet.mjs", import.meta.url));
  try {
    writeFileSync(packetPath, JSON.stringify(approvedPacket()), "utf8");
    const dryRun = spawnSync(process.execPath, [
      cliPath, "--packet", packetPath, "--db", dbPath
    ], { encoding: "utf8" });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.equal(existsSync(dbPath), false);
    assert.match(dryRun.stdout, /"mode": "dry_run"/);

    const applied = spawnSync(process.execPath, [
      cliPath, "--packet", packetPath, "--db", dbPath, "--apply"
    ], { encoding: "utf8" });
    assert.equal(applied.status, 0, applied.stderr);
    withStore((store) => {
      // The CLI's own database is checked below; this helper intentionally uses an isolated store.
      assert.equal(store.getEdgeRegisteredNode("edge-node-sgp-a"), null);
    });
    const store = createSqliteSubscriptionControlStore({ dbPath });
    try {
      const registered = store.getEdgeRegisteredNode("edge-node-sgp-a");
      assert.equal(registered.status, "inactive");
      assert.equal(registered.pool, "private");
      assert.equal(registered.lifecycle, "private-validation");
      assert.equal(registered.physicalNodeRef, "edge-node-sgp-a");
    } finally {
      store.close();
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
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

test("registered nodeRef cannot be rebound to a different physicalNodeRef", () => {
  withStore((store) => {
    const inserted = ingestEdgeNodeRegistrationFromFirstBootPacket({
      controlStore: store,
      firstBootPacket: approvedPacket(),
      firstBootPacketRef: "first_boot_sgp_a_20260613",
      registeredAt: "2026-06-13T12:30:00.000Z"
    });
    assert.throws(
      () => store.upsertEdgeRegisteredNode({
        ...inserted,
        physicalNodeRef: "edge-node-replacement"
      }),
      (error) => error.code === "node_identity_conflict"
    );
  });
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
