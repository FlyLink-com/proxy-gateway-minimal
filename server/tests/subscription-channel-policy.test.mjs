import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDataPlaneCredentialLifecyclePolicy,
  buildStablePoolProtocolPolicy
} from "../services/subscriptions/channel-policy.mjs";

function proxyConfig() {
  return {
    servers: [
      {
        id: "node_stable_ss",
        name: "stable-ss",
        protocol: "ss",
        channelPool: "stable",
        host: "198.51.100.10",
        port: 18388,
        method: "aes-256-gcm",
        password: "stable-secret"
      },
      {
        id: "node_stable_tuic",
        name: "stable-tuic",
        protocol: "tuic",
        channelPool: "stable",
        host: "198.51.100.11",
        port: 443,
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "tuic-secret"
      },
      {
        id: "node_canary_xudp",
        name: "canary-xudp",
        protocol: "vless",
        channelPool: "canary",
        network: "tcp",
        packetEncoding: "xudp",
        host: "198.51.100.12",
        port: 443,
        uuid: "22222222-2222-4222-8222-222222222222"
      }
    ]
  };
}

test("stable pool protocol policy blocks UDP QUIC style stable nodes without leaking runtime values", () => {
  const report = buildStablePoolProtocolPolicy({ proxyConfig: proxyConfig() });

  assert.equal(report.type, "gccgw_stable_pool_protocol_policy");
  assert.equal(report.ok, false);
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.deepEqual(report.blockers.map((blocker) => blocker.code), [
    "legacy_shadowsocks_not_default_stable",
    "udp_quic_protocol_in_stable_pool"
  ]);
  assert.equal(report.blockers[1].node, "stable-tuic");
  assert.equal(report.blockers[1].protocol, "tuic");
  assert.equal(report.nextAction, "restore_conservative_tcp_stable_capacity_or_move_candidate_to_canary");
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|18388|stable-secret|tuic-secret|11111111|22222222/);
});

test("stable pool protocol policy allows approved VLESS Reality TCP and keeps XUDP canary scoped", () => {
  const report = buildStablePoolProtocolPolicy({
    proxyConfig: {
      servers: [
        {
          id: "node_stable_vless_reality_tcp",
          name: "stable-vless-reality-tcp",
          protocol: "vless",
          channelPool: "stable",
          host: "198.51.100.10",
          port: 443,
          network: "tcp",
          uuid: "11111111-1111-4111-8111-111111111111",
          stableProtocolApproved: true,
          stableProtocolApprovalRef: "vless-reality-tcp-explicit-approval"
        },
        {
          id: "node_canary_xudp",
          name: "canary-xudp",
          protocol: "vless",
          channelPool: "canary",
          network: "tcp",
          packetEncoding: "xudp",
          host: "198.51.100.12",
          port: 443,
          uuid: "22222222-2222-4222-8222-222222222222"
        }
      ]
    }
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.warnings[0].code, "xudp_kept_out_of_default_stable_output");
  assert.equal(report.nextAction, "stable_pool_policy_ok");
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|11111111|22222222/);
});

test("stable pool protocol policy blocks legacy Shadowsocks from default stable output", () => {
  const report = buildStablePoolProtocolPolicy({
    proxyConfig: {
      servers: [
        {
          id: "node_stable_ss",
          name: "stable-ss",
          protocol: "shadowsocks-libev",
          channelPool: "stable",
          host: "198.51.100.10",
          port: 18388,
          method: "aes-256-gcm",
          password: "stable-secret"
        }
      ]
    }
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.blockers, [
    {
      code: "legacy_shadowsocks_not_default_stable",
      node: "stable-ss",
      protocol: "ss",
      channelPool: "stable"
    }
  ]);
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|18388|stable-secret/);
});

test("stable pool protocol policy treats HTTP/3 as a QUIC canary protocol", () => {
  const report = buildStablePoolProtocolPolicy({
    proxyConfig: {
      servers: [
        {
          id: "node_stable_h3",
          name: "stable-h3",
          protocol: "HTTP/3",
          channelPool: "stable",
          host: "198.51.100.13",
          port: 443,
          password: "h3-secret"
        }
      ]
    }
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.blockers, [
    {
      code: "udp_quic_protocol_in_stable_pool",
      node: "stable-h3",
      protocol: "http-3",
      channelPool: "stable"
    }
  ]);
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|h3-secret/);
});

test("stable pool protocol policy allows explicitly approved TUIC stable nodes with warning", () => {
  const report = buildStablePoolProtocolPolicy({
    proxyConfig: {
      servers: [
        {
          id: "node_stable_tuic_approved",
          name: "stable-tuic-approved",
          protocol: "tuic",
          channelPool: "stable",
          host: "198.51.100.11",
          port: 443,
          uuid: "11111111-1111-4111-8111-111111111111",
          password: "tuic-secret",
          stableProtocolApproved: true,
          stableProtocolApprovalRef: "japan-tuic-per-order-explicit-restart"
        }
      ]
    }
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.warnings, [
    {
      code: "udp_quic_protocol_in_stable_pool_operator_approved",
      node: "stable-tuic-approved",
      protocol: "tuic",
      channelPool: "stable",
      approvalRef: "japan-tuic-per-order-explicit-restart"
    }
  ]);
  assert.equal(report.nextAction, "stable_pool_policy_ok");
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|443|tuic-secret|11111111/);
});

test("data-plane lifecycle policy blocks shared-node credentials for forced expiry", () => {
  const report = buildDataPlaneCredentialLifecyclePolicy({
    proxyConfig: {
      servers: [
        {
          id: "node_shared",
          name: "stable-shared",
          protocol: "ss",
          channelPool: "stable",
          host: "198.51.100.10",
          port: 18388,
          method: "aes-256-gcm",
          password: "shared-secret"
        }
      ]
    }
  });

  assert.equal(report.type, "gccgw_data_plane_credential_lifecycle_policy");
  assert.equal(report.ok, false);
  assert.deepEqual(report.blockers, [
    {
      code: "shared_node_credentials_cannot_force_order_expiry",
      node: "stable-shared",
      channelPool: "stable",
      credentialMode: "shared-node"
    }
  ]);
  assert.equal(report.nextAction, "add_per_order_credential_lifecycle_surface_before_forced_expiry");
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|18388|shared-secret/);
});

test("data-plane lifecycle policy requires a safe runtime mutation surface", () => {
  const report = buildDataPlaneCredentialLifecyclePolicy({
    proxyConfig: {
      servers: [
        {
          id: "node_per_order",
          name: "stable-per-order",
          protocol: "tuic",
          channelPool: "stable",
          host: "198.51.100.11",
          port: 443,
          uuid: "11111111-1111-4111-8111-111111111111",
          password: "tuic-secret",
          physicalNodeRef: "edge-current-01",
          credentialMode: "per-order",
          credentialLifecycle: {
            addCredential: true,
            disableCredential: true,
            rotateCredential: true
          }
        }
      ]
    }
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.blockers, [
    {
      code: "per_order_credentials_missing_runtime_lifecycle_surface",
      node: "stable-per-order",
      channelPool: "stable",
      credentialMode: "per-order",
      missing: ["reload_or_api_managed"]
    }
  ]);
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|443|tuic-secret|11111111/);
});

test("data-plane lifecycle policy requires physicalNodeRef for stable per-order channels", () => {
  const report = buildDataPlaneCredentialLifecyclePolicy({
    proxyConfig: {
      servers: [
        {
          id: "node_per_order",
          name: "stable-per-order",
          protocol: "tuic",
          channelPool: "stable",
          host: "198.51.100.11",
          port: 443,
          uuid: "11111111-1111-4111-8111-111111111111",
          password: "tuic-secret",
          credentialMode: "per-order",
          credentialLifecycle: {
            addCredential: true,
            disableCredential: true,
            rotateCredential: true,
            restart: true
          }
        }
      ]
    }
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.blockers, [
    {
      code: "per_order_channel_missing_physical_node_ref",
      node: "stable-per-order",
      channelPool: "stable",
      credentialMode: "per-order"
    }
  ]);
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|443|tuic-secret|11111111/);
});

test("data-plane lifecycle policy allows per-order credentials with add disable rotate and reload surface", () => {
  const report = buildDataPlaneCredentialLifecyclePolicy({
    proxyConfig: {
      servers: [
        {
          id: "node_per_order",
          name: "stable-per-order",
          protocol: "tuic",
          channelPool: "stable",
          host: "198.51.100.11",
          port: 443,
          uuid: "11111111-1111-4111-8111-111111111111",
          password: "tuic-secret",
          physicalNodeRef: "edge-current-01",
          credentialMode: "per-order",
          credentialLifecycle: {
            addCredential: true,
            disableCredential: true,
            rotateCredential: true,
            reload: true
          }
        }
      ]
    }
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.nextAction, "data_plane_credential_lifecycle_policy_ok");
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|443|tuic-secret|11111111/);
});

test("data-plane lifecycle policy allows per-order credentials with an explicit restart surface", () => {
  const report = buildDataPlaneCredentialLifecyclePolicy({
    proxyConfig: {
      servers: [
        {
          id: "node_per_order_restart",
          name: "stable-per-order-restart",
          protocol: "tuic",
          channelPool: "stable",
          host: "198.51.100.11",
          port: 443,
          uuid: "11111111-1111-4111-8111-111111111111",
          password: "tuic-secret",
          physicalNodeRef: "edge-current-01",
          credentialMode: "per-order",
          credentialLifecycle: {
            addCredential: true,
            disableCredential: true,
            rotateCredential: true,
            restart: true
          }
        }
      ]
    }
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.warnings, [
    {
      code: "per_order_credentials_use_service_restart_activation",
      node: "stable-per-order-restart",
      channelPool: "stable",
      credentialMode: "per-order"
    }
  ]);
  assert.equal(report.nextAction, "data_plane_credential_lifecycle_policy_ok");
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|443|tuic-secret|11111111/);
});
