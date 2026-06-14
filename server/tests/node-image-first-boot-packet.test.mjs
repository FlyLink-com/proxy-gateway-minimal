import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildNodeImageFirstBootPacket } from "../services/node-image-first-boot-packet.mjs";

function withJsonFile(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "node-image-first-boot-packet-"));
  try {
    const path = join(tempDir, "first-boot.json");
    writeFileSync(path, JSON.stringify(payload, null, 2));
    return fn(path);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function readyInput(overrides = {}) {
  return {
    generatedAt: "2026-06-13T11:00:00.000Z",
    node: {
      nodeRef: "edge-node-sgp-a",
      providerRef: "provider-vultr",
      regionRef: "region-sgp",
      roleRef: "data-plane",
      channelRefs: [
        "channel-sgp-a-vless-reality-tcp",
        "channel-sgp-a-hy2",
        "channel-sgp-a-tuic"
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
      exactApprovalReceived: false,
      firstBootApplyApproved: false
    },
    notes: ["first boot packet only"],
    ...overrides
  };
}

test("node image first-boot packet summarizes safe refs without granting activation", () => {
  const packet = buildNodeImageFirstBootPacket(readyInput());

  assert.equal(packet.mode, "node-image-first-boot-packet");
  assert.deepEqual(packet.packet, {
    readyForFirstBootApproval: true,
    approvalRequired: true,
    firstBootApplyAllowed: false,
    blockers: [],
    nodeRef: "edge-node-sgp-a",
    providerRef: "provider-vultr",
    regionRef: "region-sgp",
    roleRef: "data-plane",
    channelRefCount: 3,
    imageManifestRef: "node-image-manifest-20260613",
    releaseRef: "release-node-image-20260613"
  });
  assert.equal(packet.safety.summaryOnly, true);
  assert.equal(packet.safety.noRuntimeMutation, true);
  assert.equal(packet.safety.noProtectedMaterialOutput, true);
  assert.doesNotMatch(JSON.stringify(packet), /secret-token|token=|https?:|customer@example\.com|203\.0\.113/);
});

test("node image first-boot packet requires receipt-gated render prerequisites before approval readiness", () => {
  const packet = buildNodeImageFirstBootPacket(readyInput({
    receiptGate: {
      desiredStatePullRequired: true,
      materialPullRequired: false,
      appliedReceiptRequired: true,
      renderWithholdsUntilReceipt: false
    },
    approval: {
      exactApprovalReceived: true,
      firstBootApplyApproved: true
    }
  }));

  assert.equal(packet.packet.readyForFirstBootApproval, false);
  assert.equal(packet.packet.firstBootApplyAllowed, false);
  assert.deepEqual(packet.packet.blockers, [
    "material pull is not required",
    "subscription rendering is not confirmed receipt-gated"
  ]);
});

test("node image first-boot packet separates operator approval from first-boot apply approval", () => {
  const approvalOnly = buildNodeImageFirstBootPacket(readyInput({
    approval: {
      exactApprovalReceived: true,
      firstBootApplyApproved: false
    }
  }));
  assert.equal(approvalOnly.packet.readyForFirstBootApproval, true);
  assert.equal(approvalOnly.packet.firstBootApplyAllowed, false);

  const applyApproved = buildNodeImageFirstBootPacket(readyInput({
    approval: {
      exactApprovalReceived: true,
      firstBootApplyApproved: true
    }
  }));
  assert.equal(applyApproved.packet.readyForFirstBootApproval, true);
  assert.equal(applyApproved.packet.firstBootApplyAllowed, true);
});

test("node image first-boot packet rejects raw runtime and sensitive fields without echoing values", () => {
  assert.throws(
    () => buildNodeImageFirstBootPacket({
      ...readyInput(),
      node: {
        ...readyInput().node,
        endpoint: "203.0.113.10",
        credentialRef: "token=secret-token"
      },
      notes: ["https://sub.example/sub/clash.yaml?token=secret-token"]
    }),
    (error) => {
      assert.match(error.message, /safe node image first-boot packet/);
      assert.doesNotMatch(error.message, /secret-token|203\.0\.113|sub\.example/);
      return true;
    }
  );

  assert.throws(
    () => buildNodeImageFirstBootPacket({
      ...readyInput(),
      generatedAt: "https://sub.example/sub/clash.yaml?token=secret-token"
    }),
    (error) => {
      assert.match(error.message, /safe node image first-boot packet/);
      assert.doesNotMatch(error.message, /secret-token|sub\.example/);
      return true;
    }
  );
});

test("node image first-boot packet CLI prints safe JSON", () => {
  withJsonFile(readyInput(), (path) => {
    const stdout = execFileSync(process.execPath, [
      "scripts/node-image-first-boot-packet.mjs",
      path
    ], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8"
    });

    const packet = JSON.parse(stdout);
    assert.equal(packet.ok, true);
    assert.equal(packet.mode, "node-image-first-boot-packet");
    assert.equal(packet.packet.readyForFirstBootApproval, true);
    assert.equal(packet.packet.firstBootApplyAllowed, false);
    assert.doesNotMatch(stdout, /secret-token|token=|https?:|customer@example\.com|203\.0\.113/);
  });
});

test("node image first-boot packet CLI prints sanitized JSON errors", () => {
  withJsonFile({
    ...readyInput(),
    node: {
      ...readyInput().node,
      credentialRef: "token=secret-token"
    },
    rawRuntimeConfig: "server: 203.0.113.10"
  }, (path) => {
    const result = spawnSync(process.execPath, [
      "scripts/node-image-first-boot-packet.mjs",
      path
    ], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8"
    });

    assert.notEqual(result.status, 0);
    assert.equal(result.stderr, "");
    const packet = JSON.parse(result.stdout);
    assert.equal(packet.ok, false);
    assert.equal(packet.mode, "node-image-first-boot-packet");
    assert.match(packet.error, /safe node image first-boot packet/);
    assert.doesNotMatch(result.stdout, /secret-token|203\.0\.113|credentialRef|rawRuntimeConfig/);
  });
});
