import assert from "node:assert/strict";
import test from "node:test";
import { buildCredentialReconciliationApplyPlan } from "../services/edge/credential-reconciliation-gateway.mjs";
import { createMihomoTuicExplicitRestartAdapter } from "../services/edge/mihomo-tuic-runtime-adapter.mjs";

function reconciliationState() {
  return {
    channelRef: "channel-aliyun-a-tuic",
    runtime: "mihomo-tuic",
    activationSurface: "explicit-restart",
    desiredStateRef: "desired_state_aliyun_001",
    desiredCredentials: [
      {
        credentialRef: "order_ref_new",
        orderRef: "order_new",
        userRef: "portal_user_001",
        expiresAt: "2026-07-05T00:00:00.000Z",
        materialDigest: "sha256:new_digest"
      },
      {
        credentialRef: "order_ref_rotate",
        orderRef: "order_rotate",
        userRef: "portal_user_002",
        expiresAt: "2026-07-05T00:00:00.000Z",
        materialDigest: "sha256:rotated_digest"
      },
      {
        credentialRef: "order_ref_same",
        orderRef: "order_same",
        userRef: "portal_user_003",
        expiresAt: "2026-07-05T00:00:00.000Z",
        materialDigest: "sha256:same_digest"
      }
    ],
    currentCredentials: [
      {
        credentialRef: "order_ref_expired",
        materialDigest: "sha256:expired_digest"
      },
      {
        credentialRef: "order_ref_rotate",
        materialDigest: "sha256:old_digest"
      },
      {
        credentialRef: "order_ref_same",
        materialDigest: "sha256:same_digest"
      }
    ]
  };
}

function materialFor(ref) {
  return {
    credentialRef: ref,
    uuid: `${ref}_uuid`,
    password: Buffer.from(`${ref}_password`, "utf8").toString("base64")
  };
}

test("Mihomo TUIC adapter writes candidate config and activates after validation", () => {
  const calls = [];
  let candidateConfig = "";
  const adapter = createMihomoTuicExplicitRestartAdapter({
    serviceName: "mihomo-tuic.service",
    listenerName: "channel-aliyun-a-tuic",
    listener: {
      port: 443,
      listen: "0.0.0.0",
      certificate: "/etc/mihomo/server.crt",
      privateKey: "/etc/mihomo/server.key",
      congestionController: "bbr",
      alpn: ["h3"]
    },
    resolveCredentialMaterial: (credentialRef) => materialFor(credentialRef),
    writeCandidateConfig: (content) => {
      calls.push("writeCandidateConfig");
      candidateConfig = content;
      return { candidateRef: "candidate_config_001" };
    },
    runConfigTest: () => {
      calls.push("runConfigTest");
      return { exitCode: 0 };
    },
    backupActiveConfig: () => {
      calls.push("backupActiveConfig");
      return { backupRef: "backup_aliyun_001" };
    },
    replaceActiveConfig: () => {
      calls.push("replaceActiveConfig");
      return { ok: true };
    },
    restartService: () => {
      calls.push("restartService");
      return { ok: true };
    },
    validateService: () => {
      calls.push("validateService");
      return { active: true };
    },
    validateListener: () => {
      calls.push("validateListener");
      return { udp443: true };
    },
    now: () => new Date("2026-06-05T10:00:00.000Z")
  });

  const report = buildCredentialReconciliationApplyPlan({
    desiredState: reconciliationState(),
    inputPath: "desired-state.json",
    executeProductionMutation: true,
    runtimeAdapter: adapter
  });

  assert.equal(report.ok, true);
  assert.equal(report.runtimeReceipt.status, "applied");
  assert.equal(report.runtimeReceipt.backupRef, "backup_aliyun_001");
  assert.deepEqual(calls, [
    "writeCandidateConfig",
    "runConfigTest",
    "backupActiveConfig",
    "replaceActiveConfig",
    "restartService",
    "validateService",
    "validateListener"
  ]);
  assert.match(candidateConfig, /^# managed-by: gccgw-edge-credential-reconciliation/m);
  assert.match(candidateConfig, /^listeners:/m);
  assert.match(candidateConfig, /type: tuic/);
  assert.match(candidateConfig, /port: 443/);
  assert.match(candidateConfig, /certificate: "\/etc\/mihomo\/server\.crt"/);
  assert.match(candidateConfig, /private-key: "\/etc\/mihomo\/server\.key"/);
  assert.match(candidateConfig, /users:/);
  assert.match(candidateConfig, new RegExp(`"order_ref_new_uuid": "${materialFor("order_ref_new").password}"`));
  assert.match(candidateConfig, new RegExp(`"order_ref_rotate_uuid": "${materialFor("order_ref_rotate").password}"`));
  assert.match(candidateConfig, new RegExp(`"order_ref_same_uuid": "${materialFor("order_ref_same").password}"`));
  assert.doesNotMatch(JSON.stringify(report), /b3JkZXJfcmVmX25ld19wYXNzd29yZA==|b3JkZXJfcmVmX3JvdGF0ZV9wYXNzd29yZA==|b3JkZXJfcmVmX3NhbWVfcGFzc3dvcmQ=/);
});

test("Mihomo TUIC adapter stops before backup and restart when config test fails", () => {
  const calls = [];
  const adapter = createMihomoTuicExplicitRestartAdapter({
    serviceName: "mihomo-tuic.service",
    resolveCredentialMaterial: (credentialRef) => materialFor(credentialRef),
    writeCandidateConfig: () => {
      calls.push("writeCandidateConfig");
      return { candidateRef: "candidate_config_001" };
    },
    runConfigTest: () => {
      calls.push("runConfigTest");
      return { exitCode: 1 };
    },
    backupActiveConfig: () => {
      calls.push("backupActiveConfig");
      return { backupRef: "backup_should_not_happen" };
    },
    replaceActiveConfig: () => {
      calls.push("replaceActiveConfig");
      return { ok: true };
    },
    restartService: () => {
      calls.push("restartService");
      return { ok: true };
    }
  });

  const report = buildCredentialReconciliationApplyPlan({
    desiredState: reconciliationState(),
    inputPath: "desired-state.json",
    executeProductionMutation: true,
    runtimeAdapter: adapter
  });

  assert.equal(report.ok, false);
  assert.equal(report.runtimeReceipt.status, "failed");
  assert.equal(report.runtimeReceipt.mutation, false);
  assert.deepEqual(report.runtimeReceipt.configTest, {
    exitCode: 1,
    ok: false
  });
  assert.deepEqual(calls, [
    "writeCandidateConfig",
    "runConfigTest"
  ]);
});

test("Mihomo TUIC adapter fails closed when protected material lookup fails", () => {
  const adapter = createMihomoTuicExplicitRestartAdapter({
    serviceName: "mihomo-tuic.service",
    resolveCredentialMaterial: () => null,
    writeCandidateConfig: () => {
      throw new Error("candidate config must not be written without material");
    }
  });

  const report = buildCredentialReconciliationApplyPlan({
    desiredState: reconciliationState(),
    inputPath: "desired-state.json",
    executeProductionMutation: true,
    runtimeAdapter: adapter
  });

  assert.equal(report.ok, false);
  assert.equal(report.runtimeReceipt.status, "failed");
  assert.equal(report.runtimeReceipt.mutation, false);
  assert.doesNotMatch(JSON.stringify(report), /uuid|password|candidate config/i);
});

test("Mihomo TUIC adapter fails closed before candidate config when password material is not base64", () => {
  const calls = [];
  const adapter = createMihomoTuicExplicitRestartAdapter({
    serviceName: "mihomo-tuic.service",
    resolveCredentialMaterial: (credentialRef) => ({
      credentialRef,
      uuid: "11111111-1111-4111-8111-111111111111",
      password: "not-a-base64-tuic-password"
    }),
    writeCandidateConfig: () => {
      calls.push("writeCandidateConfig");
      throw new Error("candidate config must not be written with invalid TUIC material");
    },
    runConfigTest: () => {
      calls.push("runConfigTest");
      return { exitCode: 0 };
    },
    restartService: () => {
      calls.push("restartService");
      return { ok: true };
    }
  });

  const report = buildCredentialReconciliationApplyPlan({
    desiredState: reconciliationState(),
    inputPath: "desired-state.json",
    executeProductionMutation: true,
    runtimeAdapter: adapter
  });

  assert.equal(report.ok, false);
  assert.equal(report.runtimeReceipt.status, "failed");
  assert.equal(report.runtimeReceipt.mutation, false);
  assert.deepEqual(calls, []);
  assert.doesNotMatch(JSON.stringify(report), /not-a-base64-tuic-password|11111111-1111-4111-8111-111111111111/);
});
