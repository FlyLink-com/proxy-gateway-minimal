import { generateClashSubscription } from "./clash-subscription.mjs";
import { replayChannelSubscriptionActivationFlowFixture } from "./channel-subscription-activation-flow-fixture.mjs";

const UNSAFE_METADATA_PATTERN = /[a-z][a-z0-9+.-]*:\/\/|token=|secret\.example|secret-token|approvalPhrase/i;

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function metadataToken(value) {
  return text(value).toLowerCase().replace(/[\s_]+/g, "-");
}

function protocolFor(server) {
  const raw = text(server?.protocol || server?.clashType || server?.type || "ss").toLowerCase();
  if (raw === "ss" || raw === "shadowsocks" || raw === "shadowsocks-libev" || raw === "shadowsocks-rust") {
    return "ss";
  }
  if (raw === "vless") return "vless";
  if (raw === "hysteria2" || raw === "hy2") return "hysteria2";
  if (raw === "tuic") return "tuic";
  return raw || "unknown";
}

function safeCandidate(candidate, pool) {
  return {
    name: text(candidate.name),
    protocol: text(candidate.protocol),
    qualityClass: metadataToken(candidate.qualityClass),
    pool
  };
}

function publicCandidate(candidate) {
  const payload = {
    name: text(candidate.name),
    protocol: text(candidate.protocol),
    qualityClass: metadataToken(candidate.qualityClass)
  };
  if (!payload.qualityClass) {
    delete payload.qualityClass;
  }
  return payload;
}

function requiredCandidates(replay) {
  const candidates = replay.activationFlow?.outputs?.activationHandoff?.candidates ?? {};
  return [
    ...list(candidates.baseline).map((candidate) => safeCandidate(candidate, "baseline")),
    ...list(candidates.canary).map((candidate) => safeCandidate(candidate, "canary"))
  ].filter((candidate) => candidate.name);
}

function assertSafeConfigMetadata(proxyConfig) {
  for (const server of list(proxyConfig?.servers)) {
    const values = [
      server?.name,
      server?.id,
      server?.protocol,
      server?.clashType,
      server?.type,
      server?.qualityClass,
      server?.quality,
      server?.channelQuality
    ];
    if (values.some((value) => typeof value === "string" && UNSAFE_METADATA_PATTERN.test(value))) {
      throw new Error("channel subscription render proof contains unsafe config metadata");
    }
  }
}

function findServer(proxyConfig, candidate) {
  return list(proxyConfig?.servers).find(
    (server) => text(server.name) === candidate.name || text(server.id) === candidate.name
  ) || null;
}

function countProtocols(servers) {
  const counts = {};
  for (const server of servers) {
    const protocol = protocolFor(server);
    counts[protocol] = (counts[protocol] || 0) + 1;
  }
  return counts;
}

function blockedProof({ replay, generatedAt, blockers, missingCandidates = [], protocolMismatches = [] }) {
  return {
    ok: true,
    mode: "channel-subscription-render-proof",
    generatedAt,
    status: "blocked_before_subscription_render_proof",
    flowStatus: text(replay.flowStatus),
    requiredNextAction: text(replay.requiredNextAction),
    blockers,
    missingCandidates,
    protocolMismatches,
    renderProof: {
      internalYamlRenderCompleted: false,
      yamlReturned: false,
      renderedProxyCount: 0,
      protocolCounts: {},
      baseline: [],
      canary: []
    },
    gate: {
      risk: text(replay.gate?.risk),
      gate: text(replay.gate?.gate),
      approvalRequestReady: false,
      executionAuthority: text(replay.gate?.executionAuthority),
      executesGate: false
    },
    safety: safetyFlags()
  };
}

function safetyFlags() {
  return {
    advisoryOnly: true,
    summaryOnly: true,
    renderProofOnly: true,
    noRuntimeMutation: true,
    noProductionMutation: true,
    noApprovalSubmission: true,
    noTrafficMovement: true,
    noSubscriptionOutputMutation: true,
    yamlReturned: false,
    yamlNotReturned: true,
    requiresSeparateRiskAApproval: true,
    omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls", "yaml"]
  };
}

function renderSelectedConfig(proxyConfig, selectedServers) {
  try {
    return generateClashSubscription({
      ...proxyConfig,
      servers: selectedServers
    });
  } catch {
    throw new Error("channel subscription render proof failed to render selected subscription output");
  }
}

export function buildChannelSubscriptionRenderProof({
  fixture,
  proxyConfig,
  generatedAt = new Date().toISOString()
}) {
  const replay = replayChannelSubscriptionActivationFlowFixture(fixture, { generatedAt });
  assertSafeConfigMetadata(proxyConfig);

  if (replay.gate?.approvalRequestReady !== true) {
    return blockedProof({
      replay,
      generatedAt,
      blockers: list(replay.blockers).length > 0 ? list(replay.blockers).map(text) : ["activation_flow_not_ready"]
    });
  }

  const required = requiredCandidates(replay);
  const missingCandidates = [];
  const protocolMismatches = [];
  const selected = [];
  const selectedByPool = { baseline: [], canary: [] };

  for (const candidate of required) {
    const server = findServer(proxyConfig, candidate);
    if (!server) {
      missingCandidates.push(candidate);
      continue;
    }

    const actualProtocol = protocolFor(server);
    if (candidate.protocol && actualProtocol !== candidate.protocol) {
      protocolMismatches.push({
        name: candidate.name,
        expectedProtocol: candidate.protocol,
        actualProtocol
      });
      continue;
    }

    selected.push(server);
    selectedByPool[candidate.pool].push(publicCandidate({
      ...candidate,
      protocol: actualProtocol,
      qualityClass: candidate.qualityClass || server.qualityClass || server.quality || server.channelQuality
    }));
  }

  if (missingCandidates.length > 0 || protocolMismatches.length > 0) {
    return blockedProof({
      replay,
      generatedAt,
      blockers: [
        ...(missingCandidates.length > 0 ? ["missing_subscription_output_config"] : []),
        ...(protocolMismatches.length > 0 ? ["subscription_output_protocol_mismatch"] : [])
      ],
      missingCandidates,
      protocolMismatches
    });
  }

  const yaml = renderSelectedConfig(proxyConfig, selected);

  return {
    ok: true,
    mode: "channel-subscription-render-proof",
    generatedAt,
    status: "render_proof_ready_for_subscription_output_activation_request",
    flowStatus: text(replay.flowStatus),
    requiredNextAction: text(replay.requiredNextAction),
    blockers: [],
    missingCandidates: [],
    protocolMismatches: [],
    renderProof: {
      internalYamlRenderCompleted: true,
      yamlReturned: false,
      renderedProxyCount: selected.length,
      generatedYamlBytes: Buffer.byteLength(yaml, "utf8"),
      protocolCounts: countProtocols(selected),
      baseline: selectedByPool.baseline,
      canary: selectedByPool.canary
    },
    gate: {
      risk: text(replay.gate?.risk),
      gate: text(replay.gate?.gate),
      approvalRequestReady: replay.gate?.approvalRequestReady === true,
      executionAuthority: text(replay.gate?.executionAuthority),
      executesGate: false
    },
    source: {
      fixtureGeneratedAt: text(replay.fixtureGeneratedAt),
      sourceGeneratedAt: text(replay.sourceGeneratedAt),
      schemaVersion: text(replay.schemaVersion)
    },
    safety: safetyFlags()
  };
}
