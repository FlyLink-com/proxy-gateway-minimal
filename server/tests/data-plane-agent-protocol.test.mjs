import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRedactedDesiredStateSummary,
  buildSafeAgentErrorPayload,
  validateDataPlaneApplyReceipt,
  validateDataPlaneDesiredState
} from "../services/edge/data-plane-agent-protocol.mjs";

const VALID_UNTIL = "2026-07-10T00:00:00.000Z";
const APPLIED_AT = "2026-06-10T00:00:00.000Z";

function desiredState(overrides = {}) {
  return {
    type: "gccgw_data_plane_desired_state",
    nodeRef: "node-sgp-a",
    generation: "gen_20260610_001",
    channelRefs: ["channel-sgp-a-hy2", "channel-sgp-a-tuic"],
    edgeCredentialRefs: ["edgecred_pareq_safe_hy2", "edgecred_pareq_safe_tuic"],
    materialDigests: [
      {
        channelRef: "channel-sgp-a-hy2",
        edgeCredentialRef: "edgecred_pareq_safe_hy2",
        digest: "sha256:aaaaaaaaaaaaaaaa"
      },
      {
        channelRef: "channel-sgp-a-tuic",
        edgeCredentialRef: "edgecred_pareq_safe_tuic",
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
    appliedAt: APPLIED_AT,
    reasonCode: "runtime_applied",
    materialDigests: ["sha256:aaaaaaaaaaaaaaaa"],
    ...overrides
  };
}

test("desired-state payload validates node scope, refs, expiry, and digest fields", () => {
  const result = validateDataPlaneDesiredState(desiredState(), {
    expectedNodeRef: "node-sgp-a",
    allowedChannelRefs: ["channel-sgp-a-hy2", "channel-sgp-a-tuic"]
  });

  assert.equal(result.type, "gccgw_data_plane_desired_state");
  assert.equal(result.nodeRef, "node-sgp-a");
  assert.equal(result.generation, "gen_20260610_001");
  assert.deepEqual(result.channelRefs, ["channel-sgp-a-hy2", "channel-sgp-a-tuic"]);
  assert.deepEqual(result.edgeCredentialRefs, ["edgecred_pareq_safe_hy2", "edgecred_pareq_safe_tuic"]);
  assert.equal(result.materialDigests.length, 2);
  assert.equal(result.validUntil, VALID_UNTIL);
  assert.equal(result.redacted, true);
});

test("desired-state summary is redacted and count based", () => {
  const result = validateDataPlaneDesiredState(desiredState(), {
    expectedNodeRef: "node-sgp-a",
    allowedChannelRefs: ["channel-sgp-a-hy2", "channel-sgp-a-tuic"]
  });
  const summary = buildRedactedDesiredStateSummary(result);

  assert.deepEqual(summary, {
    type: "gccgw_data_plane_desired_state_summary",
    nodeRef: "node-sgp-a",
    generation: "gen_20260610_001",
    channelCount: 2,
    edgeCredentialCount: 2,
    digestCount: 2,
    validUntil: VALID_UNTIL,
    redacted: true
  });
  assert.doesNotMatch(JSON.stringify(summary), /edgecred_pareq_safe|sha256:aaaaaaaa/i);
});

test("desired-state rejects unknown channel refs for node-scoped requests", () => {
  assert.throws(
    () =>
      validateDataPlaneDesiredState(desiredState({ channelRefs: ["channel-sgp-a-hy2", "channel-other-a-hy2"] }), {
        expectedNodeRef: "node-sgp-a",
        allowedChannelRefs: ["channel-sgp-a-hy2"]
      }),
    (error) => error.code === "channel_scope_mismatch"
  );
});

test("desired-state rejects forbidden credential material", () => {
  assert.throws(
    () =>
      validateDataPlaneDesiredState(
        desiredState({
          runtimeMaterial: {
            password: "do-not-accept-raw-material",
            privateKey: "do-not-accept-private-key"
          }
        }),
        {
          expectedNodeRef: "node-sgp-a",
          allowedChannelRefs: ["channel-sgp-a-hy2", "channel-sgp-a-tuic"]
        }
      ),
    (error) => error.code === "unsafe_agent_payload"
  );
});

test("apply receipt validates runtime facts and redacted digest fields", () => {
  const result = validateDataPlaneApplyReceipt(receipt(), {
    expectedNodeRef: "node-sgp-a",
    allowedChannelRefs: ["channel-sgp-a-hy2"]
  });

  assert.equal(result.type, "gccgw_data_plane_apply_receipt");
  assert.equal(result.nodeRef, "node-sgp-a");
  assert.equal(result.channelRef, "channel-sgp-a-hy2");
  assert.equal(result.status, "applied");
  assert.equal(result.configTest, true);
  assert.equal(result.serviceActive, true);
  assert.equal(result.listenerPresent, true);
  assert.equal(result.credentialCount, 2);
  assert.equal(result.appliedAt, APPLIED_AT);
  assert.equal(result.reasonCode, "runtime_applied");
  assert.deepEqual(result.materialDigests, ["sha256:aaaaaaaaaaaaaaaa"]);
  assert.equal(result.redacted, true);
});

test("apply receipt rejects stale generation and raw subscription material", () => {
  assert.throws(
    () =>
      validateDataPlaneApplyReceipt(
        receipt({
          generation: "gen_old",
          diagnostics: { subscriptionUrl: "https://example.invalid/sub?token=raw" }
        }),
        {
          expectedNodeRef: "node-sgp-a",
          expectedGeneration: "gen_20260610_001",
          allowedChannelRefs: ["channel-sgp-a-hy2"]
        }
      ),
    (error) => error.code === "unsafe_agent_payload"
  );
});

test("safe error payload does not leak raw input values", () => {
  let captured;
  try {
    validateDataPlaneApplyReceipt(receipt({ token: "raw-token-value" }), {
      expectedNodeRef: "node-sgp-a",
      allowedChannelRefs: ["channel-sgp-a-hy2"]
    });
  } catch (error) {
    captured = buildSafeAgentErrorPayload(error);
  }

  assert.equal(captured.error, "unsafe_agent_payload");
  assert.equal(captured.message, "unsafe_agent_payload");
  assert.equal(captured.redacted, true);
  assert.doesNotMatch(JSON.stringify(captured), /raw-token-value|token/i);
});
