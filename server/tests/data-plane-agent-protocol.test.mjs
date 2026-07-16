import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRedactedDesiredStateSummary,
  buildSafeAgentErrorPayload,
  validateDataPlaneApplyReceipt,
  validateDataPlaneDesiredState,
  validateDataPlaneMaterialRequest,
  validateDataPlaneMaterialResponse
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

test("desired-state accepts channel-authoritative scoped revocation tombstones", () => {
  const scopedTombstone = {
    sourceDesiredStateRef: "desired_state_channel-sgp-a-hy2_source_001",
    sourceGeneration: "gen_channel_sgp_hy2_source_001",
    credentialDigests: [
      "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    ]
  };
  const activeMaterialDigests = [
    {
      channelRef: "channel-sgp-a-hy2",
      edgeCredentialRef: "edgecred_active_a",
      digest: "sha256:aaaaaaaaaaaaaaaa"
    },
    {
      channelRef: "channel-sgp-a-hy2",
      edgeCredentialRef: "edgecred_active_b",
      digest: "sha256:bbbbbbbbbbbbbbbb"
    }
  ];
  const scenarios = [
    {
      name: "tombstone-only",
      edgeCredentialRefs: [],
      materialDigests: [],
      receiptMaterialDigests: []
    },
    {
      name: "mixed-active-and-revoked",
      edgeCredentialRefs: ["edgecred_active_a", "edgecred_active_b"],
      materialDigests: activeMaterialDigests,
      receiptMaterialDigests: activeMaterialDigests.map((entry) => entry.digest)
    }
  ];

  for (const scenario of scenarios) {
    const result = validateDataPlaneDesiredState(desiredState({
      channelRefs: ["channel-sgp-a-hy2"],
      edgeCredentialRefs: scenario.edgeCredentialRefs,
      materialDigests: scenario.materialDigests,
      scopedTombstone
    }), {
      expectedNodeRef: "node-sgp-a",
      allowedChannelRefs: ["channel-sgp-a-hy2"]
    });

    assert.deepEqual(result.edgeCredentialRefs, scenario.edgeCredentialRefs, scenario.name);
    assert.deepEqual(result.materialDigests, scenario.materialDigests, scenario.name);
    assert.deepEqual(result.scopedTombstone, scopedTombstone, scenario.name);
    assert.deepEqual(buildRedactedDesiredStateSummary(result), {
      type: "gccgw_data_plane_desired_state_summary",
      nodeRef: "node-sgp-a",
      generation: "gen_20260610_001",
      channelCount: 1,
      edgeCredentialCount: scenario.edgeCredentialRefs.length,
      digestCount: scenario.materialDigests.length,
      validUntil: VALID_UNTIL,
      scopedTombstone: true,
      scopeCount: 1,
      redacted: true
    }, scenario.name);

    const desiredStateRef = `desired_scoped_protocol_${scenario.name}`;
    const generation = `gen_scoped_protocol_${scenario.name}`;
    const scopedReceipt = validateDataPlaneApplyReceipt(receipt({
      desiredStateRef,
      generation,
      credentialCount: scenario.edgeCredentialRefs.length,
      materialDigests: scenario.receiptMaterialDigests,
      scopedTombstone
    }), {
      expectedNodeRef: "node-sgp-a",
      expectedDesiredStateRef: desiredStateRef,
      expectedGeneration: generation,
      allowedChannelRefs: ["channel-sgp-a-hy2"]
    });
    assert.equal(scopedReceipt.credentialCount, scenario.edgeCredentialRefs.length, scenario.name);
    assert.deepEqual(scopedReceipt.materialDigests, scenario.receiptMaterialDigests, scenario.name);
    assert.deepEqual(scopedReceipt.scopedTombstone, scopedTombstone, scenario.name);
  }

  assert.throws(
    () => validateDataPlaneDesiredState(desiredState({
      channelRefs: ["channel-sgp-a-hy2"],
      edgeCredentialRefs: [],
      materialDigests: [],
      scopedTombstone: {
        sourceDesiredStateRef: scopedTombstone.sourceDesiredStateRef,
        credentialDigests: scopedTombstone.credentialDigests
      }
    })),
    (error) => error.code === "validation_error"
  );

  assert.throws(
    () => validateDataPlaneDesiredState(desiredState({
      channelRefs: ["channel-sgp-a-hy2"],
      edgeCredentialRefs: [],
      materialDigests: [],
      scopedTombstone: {
        ...scopedTombstone,
        credentialDigests: scopedTombstone.credentialDigests.map((digest) => digest.toUpperCase())
      }
    })),
    (error) => error.code === "validation_error"
  );

  assert.throws(
    () => validateDataPlaneDesiredState(desiredState({
      edgeCredentialRefs: ["edgecred_active_a", "edgecred_active_b"],
      materialDigests: activeMaterialDigests,
      scopedTombstone
    })),
    (error) => error.code === "validation_error"
  );
});

test("revocation tombstones reject orphaned material digests", () => {
  assert.throws(
    () => validateDataPlaneDesiredState(desiredState({
      channelRefs: ["channel-sgp-a-hy2"],
      edgeCredentialRefs: [],
      materialDigests: ["sha256:aaaaaaaaaaaaaaaa"]
    })),
    (error) => error.code === "validation_error"
  );
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

test("material request validates node scope, desired state scope, and requested refs", () => {
  const result = validateDataPlaneMaterialRequest({
    type: "gccgw_data_plane_material_request",
    nodeRef: "node-sgp-a",
    desiredStateRef: "desired_sgp_hy2_001",
    edgeCredentialRefs: ["edgecred_pareq_safe_hy2"],
    mode: "material"
  }, {
    expectedNodeRef: "node-sgp-a"
  });

  assert.deepEqual(result, {
    type: "gccgw_data_plane_material_request",
    nodeRef: "node-sgp-a",
    desiredStateRef: "desired_sgp_hy2_001",
    edgeCredentialRefs: ["edgecred_pareq_safe_hy2"],
    mode: "material"
  });
});

test("material request rejects wrong node, empty refs, and unsafe payloads", () => {
  assert.throws(
    () => validateDataPlaneMaterialRequest({
      nodeRef: "node-other",
      desiredStateRef: "desired_sgp_hy2_001",
      edgeCredentialRefs: ["edgecred_pareq_safe_hy2"],
      mode: "material"
    }, {
      expectedNodeRef: "node-sgp-a"
    }),
    (error) => error.code === "node_scope_mismatch"
  );

  assert.throws(
    () => validateDataPlaneMaterialRequest({
      nodeRef: "node-sgp-a",
      desiredStateRef: "desired_sgp_hy2_001",
      edgeCredentialRefs: [],
      mode: "material"
    }, {
      expectedNodeRef: "node-sgp-a"
    }),
    (error) => error.code === "validation_error"
  );

  assert.throws(
    () => validateDataPlaneMaterialRequest({
      nodeRef: "node-sgp-a",
      desiredStateRef: "desired_sgp_hy2_001",
      edgeCredentialRefs: ["edgecred_pareq_safe_hy2"],
      mode: "material",
      diagnostics: { token: "unsafe" }
    }, {
      expectedNodeRef: "node-sgp-a"
    }),
    (error) => error.code === "unsafe_agent_payload"
  );
});

test("material request rejects unrelated fields even when they contain no sensitive values", () => {
  assert.throws(
    () => validateDataPlaneMaterialRequest({
      nodeRef: "node-sgp-a",
      desiredStateRef: "desired_sgp_hy2_001",
      edgeCredentialRefs: ["edgecred_pareq_safe_hy2"],
      mode: "material",
      diagnostics: {
        traceRef: "trace_safe_001"
      }
    }, {
      expectedNodeRef: "node-sgp-a"
    }),
    (error) => error.code === "validation_error"
  );
});

test("material response validates summary mode as redacted digest presence only", () => {
  const result = validateDataPlaneMaterialResponse({
    type: "gccgw_data_plane_material_response",
    nodeRef: "node-sgp-a",
    desiredStateRef: "desired_sgp_hy2_001",
    mode: "summary",
    records: [{
      edgeCredentialRef: "edgecred_pareq_safe_hy2",
      materialDigest: "sha256:aaaaaaaaaaaaaaaa",
      hasMaterial: true
    }],
    redacted: true
  }, {
    expectedNodeRef: "node-sgp-a",
    expectedDesiredStateRef: "desired_sgp_hy2_001"
  });

  assert.equal(result.mode, "summary");
  assert.equal(result.redacted, true);
  assert.deepEqual(result.records, [{
    edgeCredentialRef: "edgecred_pareq_safe_hy2",
    materialDigest: "sha256:aaaaaaaaaaaaaaaa",
    hasMaterial: true
  }]);
  assert.doesNotMatch(JSON.stringify(result), /unsafe-uuid|unsafe-password/i);
});

test("material response validates material mode without redacting the returned record", () => {
  const result = validateDataPlaneMaterialResponse({
    type: "gccgw_data_plane_material_response",
    nodeRef: "node-sgp-a",
    desiredStateRef: "desired_sgp_hy2_001",
    mode: "material",
    records: [{
      edgeCredentialRef: "edgecred_pareq_safe_hy2",
      materialDigest: "sha256:aaaaaaaaaaaaaaaa",
      material: {
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "synthetic-hy2-material"
      }
    }],
    sensitive: true
  }, {
    expectedNodeRef: "node-sgp-a",
    expectedDesiredStateRef: "desired_sgp_hy2_001"
  });

  assert.equal(result.mode, "material");
  assert.equal(result.sensitive, true);
  assert.equal(result.records[0].edgeCredentialRef, "edgecred_pareq_safe_hy2");
  assert.deepEqual(result.records[0].material, {
    uuid: "11111111-1111-4111-8111-111111111111",
    password: "synthetic-hy2-material"
  });
});
