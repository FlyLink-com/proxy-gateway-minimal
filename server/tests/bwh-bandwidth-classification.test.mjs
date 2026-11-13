import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import {
  bandwidthClassificationTopology, observeBandwidthClassification
} from "../services/platform/bwh-bandwidth-classification.mjs";
import {
  applyBwhBandwidthSchema, applyPlan, plan, readBwhBandwidth, saveFromAdmin
} from "../services/platform/bwh-shared-bandwidth.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SERVICES = ["xray-vless-reality.service", "hysteria2.service", "mihomo-tuic.service"];

function flowsFor(topology) {
  const protocol = [];
  const exempt = [];
  for (const item of topology.protocols) {
    for (const direction of topology.directions) {
      for (const leg of topology.legs) {
        for (const phase of topology.phases) {
          for (const transport of topology.transports) {
            for (const family of topology.families) {
              const returnPath = leg === "origin" || phase === "existing";
              protocol.push({
                subject: "protocol",
                protocol: item.id,
                direction, leg, phase, transport, family,
                evidenceKind: returnPath ? "conntrack-mark" : "socket-cgroup",
                queue: topology.queues[direction]
              });
            }
          }
        }
      }
    }
  }
  for (const className of topology.exemptions) {
    for (const direction of topology.directions) {
      for (const family of topology.families) {
        exempt.push({
          subject: "exempt",
          className, direction, family,
          evidenceKind: "ctinfo-restore",
          queue: topology.queues.exempt
        });
      }
    }
  }
  return { protocol, exempt };
}

function envelope(topology, flows, extra = {}) {
  return {
    profileId: topology.profileId,
    interfaceName: "eth0",
    mark: topology.mark,
    mask: topology.mask,
    flows,
    ...extra
  };
}

function observe(topology, flows, extra) {
  return observeBandwidthClassification(envelope(topology, flows, extra));
}

test("classification topology names both legs, both phases, and every protocol path", () => {
  const topology = bandwidthClassificationTopology();
  const flows = flowsFor(topology);
  assert.deepEqual(topology.protocols.map((item) => item.service), SERVICES);
  assert.deepEqual(topology.directions, ["inbound", "outbound"]);
  assert.deepEqual(topology.legs, ["client", "origin"]);
  assert.deepEqual(topology.phases, ["first", "existing"]);
  assert.deepEqual(topology.transports, ["tcp", "udp", "quic"]);
  assert.deepEqual(topology.families, ["ipv4", "ipv6"]);
  assert.equal(topology.queues.inbound, "1:10");
  assert.equal(topology.queues.outbound, "1:11");
  assert.notEqual(topology.queues.inbound, topology.queues.outbound);
  assert.equal(flows.protocol.length, 144);
  assert.equal(flows.exempt.length, 28);
  assert.equal(topology.hostFixture, "not_authorized");
});

test("a service-name list or a boolean is not classification", () => {
  const topology = bandwidthClassificationTopology();
  const fromNames = observeBandwidthClassification(SERVICES);
  const fromBoolean = observeBandwidthClassification({ classificationAttached: true });
  assert.equal(fromNames.proven, false);
  assert.equal(fromNames.classificationAttached, false);
  assert.equal(fromNames.reason, "service_name_not_classification");
  assert.equal(fromNames.matrixComplete, false);
  assert.equal(fromBoolean.proven, false);
  assert.equal(fromBoolean.classificationAttached, false);
  assert.equal(fromBoolean.reason, "boolean_not_classification");
  assert.equal(topology.protocols.length, 3);
});

test("listen ports, a shared uid, a whole nic, and a namespace move are refused", () => {
  const topology = bandwidthClassificationTopology();
  const flows = flowsFor(topology);
  const rows = [...flows.protocol, ...flows.exempt];
  const ports = observe(topology, rows.map((row) => ({ ...row, evidenceKind: "listen-port" })));
  assert.equal(ports.reason, "listen_port_not_classification");
  assert.equal(ports.proven, false);
  assert.equal(ports.matrixComplete, false);
  assert.equal(observe(topology, rows, { uid: 0 }).reason, "shared_uid_not_classification");
  assert.equal(observe(topology, rows, { wholeNic: true }).reason, "whole_nic_not_classification");
  assert.equal(observe(topology, rows, { networkNamespaceMigrated: true }).reason, "namespace_move_not_authorized");
  assert.equal(observe(topology, rows, { serviceIdentityChanged: true }).reason, "namespace_move_not_authorized");
});

test("missing ipv6, existing connections, ingress, or the origin leg stops with that gap", () => {
  const topology = bandwidthClassificationTopology();
  const flows = flowsFor(topology);
  const rows = [...flows.protocol, ...flows.exempt];
  const without = (predicate) => rows.filter((row) => !predicate(row));
  const ipv6 = observe(topology, without((row) => row.subject === "protocol" && row.family === "ipv6"));
  const existing = observe(topology, without((row) => row.subject === "protocol" && row.phase === "existing"));
  const ingress = observe(topology, without((row) => row.subject === "protocol" && row.direction === "inbound"));
  const origin = observe(topology, without((row) => row.subject === "protocol" && row.leg === "origin"));
  assert.equal(ipv6.reason, "ipv6_unproven");
  assert.equal(ipv6.missingCounts.ipv6, 72);
  assert.equal(existing.reason, "existing_connection_unproven");
  assert.equal(ingress.reason, "ingress_unproven");
  assert.equal(origin.reason, "origin_leg_unproven");
  for (const verdict of [ipv6, existing, ingress, origin]) {
    assert.equal(verdict.proven, false);
    assert.equal(verdict.classificationAttached, false);
    assert.equal(verdict.matrixComplete, false);
  }
  assert.equal(observe(topology, rows, { ipv6Available: false }).reason, "ipv6_unproven");
  assert.equal(observe(topology, rows, { existingConnectionsDrained: true }).reason, "existing_connection_unproven");
});

test("a management flow in a shared rate class is not exempt", () => {
  const topology = bandwidthClassificationTopology();
  const flows = flowsFor(topology);
  const leaked = flows.exempt.map((row, index) => index === 0 ? { ...row, queue: topology.queues.inbound } : row);
  const verdict = observe(topology, [...flows.protocol, ...leaked]);
  assert.equal(verdict.reason, "management_not_exempt");
  assert.equal(verdict.missingCounts.leakedExemptions > 0, true);
  assert.equal(verdict.proven, false);
  assert.equal(verdict.classificationAttached, false);
});

test("a full synthetic matrix still does not attach classification or run", async (t) => {
  const topology = bandwidthClassificationTopology();
  const flows = flowsFor(topology);
  const verdict = observe(topology, [...flows.protocol, ...flows.exempt]);
  assert.equal(verdict.matrixComplete, true);
  assert.equal(verdict.proven, false);
  assert.equal(verdict.classificationAttached, false);
  assert.equal(verdict.reason, "host_fixture_unauthorized");
  assert.equal(verdict.bindings.kernelReadback, false);
  assert.equal(verdict.bindings.interfaceIndex, false);
  assert.equal(verdict.bindings.serviceCgroup, false);
  const planned = plan({
    inbound: { enabled: true, bps: 1500000 }, outbound: { enabled: true, bps: 2500000 }
  }, "eth0");
  assert.equal(planned.classificationAttached, false);
  assert.equal(planned.steps.some((step) => step.argv.includes("filter")), false);
  const db = new Database(":memory:");
  t.after(() => db.close());
  applyBwhBandwidthSchema(db);
  const directory = mkdtempSync(join(tmpdir(), "bwh-bandwidth-class-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const initial = readBwhBandwidth(db);
  saveFromAdmin(db, {
    bandwidthRevision: initial.revision,
    inboundEnabled: true, outboundEnabled: true, inboundMbps: "1.5", outboundMbps: "2.5"
  });
  let calls = 0;
  const applied = await applyPlan({
    db, lockDirectory: directory, interfaceName: "eth0",
    observation: verdict,
    run() { calls += 1; return 0; },
    readback() { calls += 1; return { classificationProven: true, managementExemptProven: true, inboundBps: 1500000, outboundBps: 2500000 }; }
  });
  assert.equal(calls, 0);
  assert.equal(applied.state, "failed");
  assert.equal(applied.reason, "classification_unproven");
});

test("a wrong mark or an echoed address is not a binding", () => {
  const topology = bandwidthClassificationTopology();
  const flows = flowsFor(topology);
  const rows = [...flows.protocol, ...flows.exempt];
  const drifted = observe(topology, rows, { mark: topology.mark + 1 });
  assert.equal(drifted.reason, "binding_mismatch");
  assert.equal(drifted.proven, false);
  assert.equal(drifted.classificationAttached, false);
  const [first, ...rest] = rows;
  assert.throws(
    () => observe(topology, [{ ...first, address: "203.0.113.10" }, ...rest]),
    (error) => error?.code === "bwh_bandwidth_invalid"
  );
});
