import { normalizeNode } from "./node-registry.mjs";
import {
  PER_ORDER_CREDENTIAL_MODE,
  SHARED_NODE_MODE
} from "./validation.mjs";

const CONSERVATIVE_STABLE_PROTOCOLS = new Set(["vless"]);
const UDP_QUIC_STYLE_PROTOCOLS = new Set(["tuic", "hysteria2", "h3", "http3", "http-3", "quic"]);

function text(value) {
  return String(value ?? "").trim();
}

function token(value) {
  return text(value).toLowerCase().replace(/[\/\s_]+/g, "-");
}

function protocolFor(server) {
  const raw = token(server.protocol || server.clashType || server.type || "ss");
  if (raw === "shadowsocks" || raw === "shadowsocks-libev" || raw === "shadowsocks-rust") {
    return "ss";
  }
  if (raw === "hy2") {
    return "hysteria2";
  }
  return raw || "unknown";
}

function safeNodePolicy(server, index) {
  const node = normalizeNode(server, index);
  return {
    id: node.id,
    name: node.name,
    channelPool: node.channelPool,
    subscriptionEligible: node.subscriptionEligible,
    protocol: protocolFor(server),
    network: token(server.network || server.transport || ""),
    packetEncoding: token(server.packetEncoding || server["packet-encoding"] || ""),
    stableProtocolApproved: server.stableProtocolApproved === true,
    stableProtocolApprovalRef: text(server.stableProtocolApprovalRef)
  };
}

function policyFinding(code, detail) {
  return {
    code,
    ...detail
  };
}

function credentialLifecycleFor(server = {}) {
  const lifecycle =
    server.credentialLifecycle ||
    server.dataPlaneCredentialLifecycle ||
    server.runtimeCredentialLifecycle ||
    {};
  return {
    addCredential: lifecycle.addCredential === true || lifecycle.add === true,
    disableCredential: lifecycle.disableCredential === true || lifecycle.disable === true,
    rotateCredential: lifecycle.rotateCredential === true || lifecycle.rotate === true,
    reload: lifecycle.reload === true || lifecycle.reloadConfig === true || lifecycle.execReload === true,
    apiManaged: lifecycle.apiManaged === true || lifecycle.externalController === true,
    restart: lifecycle.restart === true ||
      lifecycle.serviceRestart === true ||
      lifecycle.explicitRestart === true
  };
}

function missingCredentialLifecycleCapabilities(lifecycle) {
  const missing = [];
  if (!lifecycle.addCredential) missing.push("addCredential");
  if (!lifecycle.disableCredential) missing.push("disableCredential");
  if (!lifecycle.rotateCredential) missing.push("rotateCredential");
  if (!lifecycle.reload && !lifecycle.apiManaged && !lifecycle.restart) {
    missing.push("reload_or_api_managed");
  }
  return missing;
}

export function buildStablePoolProtocolPolicy({ proxyConfig = {} } = {}) {
  const nodes = (proxyConfig.servers || [])
    .filter((server) => text(server.name || server.id))
    .map(safeNodePolicy);
  const blockers = [];
  const warnings = [];

  for (const node of nodes) {
    if (node.channelPool !== "stable" || node.subscriptionEligible !== true) {
      if (node.protocol === "vless" && node.packetEncoding === "xudp") {
        warnings.push(policyFinding("xudp_kept_out_of_default_stable_output", {
          node: node.name,
          protocol: node.protocol,
          channelPool: node.channelPool
        }));
      }
      continue;
    }

    if (node.protocol === "ss") {
      blockers.push(policyFinding("legacy_shadowsocks_not_default_stable", {
        node: node.name,
        protocol: node.protocol,
        channelPool: node.channelPool
      }));
      continue;
    }

    if (UDP_QUIC_STYLE_PROTOCOLS.has(node.protocol) && node.stableProtocolApproved) {
      warnings.push(policyFinding("udp_quic_protocol_in_stable_pool_operator_approved", {
        node: node.name,
        protocol: node.protocol,
        channelPool: node.channelPool,
        approvalRef: node.stableProtocolApprovalRef || "unspecified"
      }));
      continue;
    }

    if (UDP_QUIC_STYLE_PROTOCOLS.has(node.protocol)) {
      blockers.push(policyFinding("udp_quic_protocol_in_stable_pool", {
        node: node.name,
        protocol: node.protocol,
        channelPool: node.channelPool
      }));
      continue;
    }

    if (node.protocol === "vless" && node.packetEncoding === "xudp") {
      blockers.push(policyFinding("vless_xudp_not_default_stable", {
        node: node.name,
        protocol: node.protocol,
        channelPool: node.channelPool
      }));
      continue;
    }

    if (!CONSERVATIVE_STABLE_PROTOCOLS.has(node.protocol)) {
      warnings.push(policyFinding("stable_protocol_requires_operator_review", {
        node: node.name,
        protocol: node.protocol,
        channelPool: node.channelPool
      }));
    }

    if (node.protocol === "vless" && node.packetEncoding === "xudp") {
      warnings.push(policyFinding("xudp_behavior_requires_canary_measurement", {
        node: node.name,
        protocol: node.protocol,
        channelPool: node.channelPool
      }));
    }
  }

  return {
    type: "gccgw_stable_pool_protocol_policy",
    generatedBy: "gccgw node policy-check",
    ok: blockers.length === 0,
    nodeCount: nodes.length,
    blockers,
    warnings,
    nextAction: blockers.length > 0
      ? "restore_conservative_tcp_stable_capacity_or_move_candidate_to_canary"
      : "stable_pool_policy_ok",
    mutation: false,
    productionAuthority: false,
    redacted: true
  };
}

export function buildDataPlaneCredentialLifecyclePolicy({ proxyConfig = {} } = {}) {
  const nodes = (proxyConfig.servers || [])
    .filter((server) => text(server.name || server.id))
    .map((server, index) => ({
      server,
      node: normalizeNode(server, index)
    }));
  const blockers = [];
  const warnings = [];

  for (const { server, node } of nodes) {
    if (node.channelPool !== "stable" || node.subscriptionEligible !== true) {
      continue;
    }

    if (node.credentialMode !== PER_ORDER_CREDENTIAL_MODE) {
      blockers.push(policyFinding("shared_node_credentials_cannot_force_order_expiry", {
        node: node.name,
        channelPool: node.channelPool,
        credentialMode: SHARED_NODE_MODE
      }));
      continue;
    }

    if (!node.physicalNodeRef) {
      blockers.push(policyFinding("per_order_channel_missing_physical_node_ref", {
        node: node.name,
        channelPool: node.channelPool,
        credentialMode: PER_ORDER_CREDENTIAL_MODE
      }));
      continue;
    }

    const lifecycle = credentialLifecycleFor(server);
    const missing = missingCredentialLifecycleCapabilities(lifecycle);
    if (missing.length > 0) {
      blockers.push(policyFinding("per_order_credentials_missing_runtime_lifecycle_surface", {
        node: node.name,
        channelPool: node.channelPool,
        credentialMode: PER_ORDER_CREDENTIAL_MODE,
        missing
      }));
      continue;
    }

    if (lifecycle.apiManaged) {
      warnings.push(policyFinding("per_order_credentials_require_runtime_api_gate", {
        node: node.name,
        channelPool: node.channelPool,
        credentialMode: PER_ORDER_CREDENTIAL_MODE
      }));
    }

    if (lifecycle.restart) {
      warnings.push(policyFinding("per_order_credentials_use_service_restart_activation", {
        node: node.name,
        channelPool: node.channelPool,
        credentialMode: PER_ORDER_CREDENTIAL_MODE
      }));
    }
  }

  return {
    type: "gccgw_data_plane_credential_lifecycle_policy",
    generatedBy: "gccgw node data-plane-lifecycle-policy",
    ok: blockers.length === 0,
    nodeCount: nodes.length,
    checkedStableEligibleNodes: nodes.filter(({ node }) =>
      node.channelPool === "stable" && node.subscriptionEligible === true
    ).length,
    blockers,
    warnings,
    nextAction: blockers.length > 0
      ? "add_per_order_credential_lifecycle_surface_before_forced_expiry"
      : "data_plane_credential_lifecycle_policy_ok",
    mutation: false,
    productionAuthority: false,
    redacted: true
  };
}
