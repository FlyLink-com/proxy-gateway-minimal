import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { bandwidthClassificationTopology } from "../services/platform/bwh-bandwidth-classification.mjs";
import { observeSharedRateProof, SHARED_RATE_CONTRACT, sharedRateTopology } from "../services/platform/bwh-bandwidth-rate-proof.mjs";
import { plan } from "../services/platform/bwh-shared-bandwidth.mjs";

function sample(overrides = {}) {
  return {
    load: "all", direction: "inbound", leg: "client", phase: "first", transport: "tcp", family: "ipv4",
    offeredBps: 2_000_000, sharedBps: 1_000_000, warmupBytes: 0, steadyBytes: 1_250_000,
    steadyMs: SHARED_RATE_CONTRACT.steadyMs, connections: 4, lossIncreased: false,
    ...overrides
  };
}

test("the shared-rate checklist is fixed and unobserved before any host run", () => {
  const classification = bandwidthClassificationTopology();
  const topology = sharedRateTopology();
  assert.deepEqual(topology.loads, ["vless", "hy2", "tuic", "all"]);
  assert.deepEqual([...topology.directions], ["inbound", "outbound"]);
  assert.deepEqual([...topology.legs], ["client", "origin"]);
  assert.deepEqual([...topology.phases], ["first", "existing"]);
  assert.deepEqual([...topology.transports], ["tcp", "udp", "quic"]);
  assert.deepEqual([...topology.families], ["ipv4", "ipv6"]);
  assert.ok(topology.exemptions.includes("ssh"));
  assert.ok(topology.exemptions.includes("admin"));
  assert.ok(topology.exemptions.includes("portal"));
  assert.ok(topology.exemptions.includes("subscription"));
  assert.ok(topology.exemptions.includes("metering"));
  assert.deepEqual([...topology.faults], [
    "partial-apply", "command-timeout", "readback-error", "persistence-failure",
    "object-conflict", "rollback-failure", "restart", "cleanup"
  ]);
  assert.equal(topology.rateCells.length, topology.loads.length * classification.directions.length * classification.legs.length
    * classification.phases.length * classification.transports.length * classification.families.length);
  const report = observeSharedRateProof();
  assert.equal(report.ok, false);
  assert.equal(report.proven, false);
  assert.equal(report.classificationAttached, false);
  assert.equal(report.reason, "isolation_not_authorized");
  assert.equal(report.measurement, "not_run");
  assert.equal(report.contract.offeredLoadRatio, 2);
  assert.equal(report.contract.warmupMs, 3000);
  assert.equal(report.contract.steadyMs, 10000);
  assert.equal(report.contract.toleranceMilli, 100);
  assert.equal(report.contract.burst, "excluded-from-steady");
  assert.deepEqual(report.sharedBudgets, { inbound: "1:10", outbound: "1:11", perProtocol: false });
  assert.equal(report.counts.rateCells, topology.rateCells.length);
  assert.equal(report.counts.exemptions, classification.exemptions.length * classification.directions.length * classification.families.length);
  assert.equal(report.counts.faults, topology.faults.length);
  assert.equal(report.counts.refused, 0);
  assert.equal(report.counts.unobserved, report.items.length);
  assert.equal(report.items.every((item) => item.status === "unobserved" && item.reason === "isolation_not_authorized"), true);
  assert.equal(report.items.some((item) => item.id === "r|vless|outbound|origin|existing|quic|ipv6"), true);
  assert.equal(report.items.some((item) => item.id === "r|all|inbound|client|first|tcp|ipv4"), true);
  assert.equal(report.items.some((item) => item.id === "f|cleanup"), true);
  assert.equal(plan({ inbound: { enabled: false, bps: null }, outbound: { enabled: false, bps: null } }, "eth0").classificationAttached, false);
});

test("paper counters, loss, a single payload, and a fixed success stay unproven", () => {
  const fitting = observeSharedRateProof({ ok: true, samples: [sample()] });
  assert.equal(fitting.ok, false);
  assert.equal(fitting.proven, false);
  assert.equal(fitting.classificationAttached, false);
  assert.equal(fitting.items.find((item) => item.id === "r|all|inbound|client|first|tcp|ipv4").status, "unobserved");
  assert.equal(fitting.refusals.some((item) => item.code === "fixed_success"), true);
  assert.equal(fitting.refusals.some((item) => item.code === "synthetic_counter_not_measurement"), true);
  const single = observeSharedRateProof({ payloadBytes: 1250000, samples: [sample({ connections: 1 })] });
  assert.equal(single.items.find((item) => item.id === "r|all|inbound|client|first|tcp|ipv4").status, "refused");
  assert.equal(single.items.find((item) => item.id === "r|all|inbound|client|first|tcp|ipv4").reason, "single_connection_payload");
  const loss = observeSharedRateProof({ packetLoss: true, samples: [sample({ lossIncreased: true })] });
  assert.equal(loss.items.find((item) => item.id === "r|all|inbound|client|first|tcp|ipv4").reason, "loss_is_not_rate");
  const wide = observeSharedRateProof({ toleranceMilli: 500, warmupMs: 0, burstIncluded: true });
  assert.deepEqual(wide.refusals.map((item) => item.code).sort(), ["burst_not_excluded", "tolerance_widened", "window_not_separated"]);
  assert.equal(wide.proven, false);
  const overflow = observeSharedRateProof({ samples: [sample({ steadyBytes: 5_000_000 })] });
  assert.equal(overflow.items.find((item) => item.id === "r|all|inbound|client|first|tcp|ipv4").reason, "budget_not_shared");
  const ceiling = observeSharedRateProof({ samples: [sample({ load: "vless", steadyBytes: 5_000_000 })] });
  assert.equal(ceiling.items.find((item) => item.id === "r|vless|inbound|client|first|tcp|ipv4").reason, "above_shared_ceiling");
  const drift = observeSharedRateProof({ samples: [sample(), sample({ sharedBps: 2_000_000, offeredBps: 4_000_000 })] });
  assert.equal(drift.refusals.some((item) => item.code === "shared_budget_drift"), true);
});

test("exemption leaks and claimed fault success do not become a completed run", () => {
  const leaked = observeSharedRateProof({
    exemptions: [{ className: "ssh", direction: "inbound", family: "ipv4", queue: "1:10" }],
    faults: { cleanup: true, restart: false }
  });
  assert.equal(leaked.items.find((item) => item.id === "x|ssh|inbound|ipv4").reason, "exemption_leak");
  assert.equal(leaked.items.find((item) => item.id === "f|cleanup").reason, "fault_success_not_proof");
  assert.equal(leaked.items.find((item) => item.id === "f|restart").status, "unobserved");
  assert.equal(leaked.refusals.some((item) => item.code === "synthetic_fault_not_a_run"), true);
  assert.equal(leaked.ok, false);
  assert.equal(leaked.measurement, "not_run");
  const separate = observeSharedRateProof({ samples: ["vless", "hy2", "tuic"].map((load) => sample({ load })) });
  assert.equal(separate.refusals.some((item) => item.code === "budget_not_shared"), false);
  assert.equal(separate.items.find((item) => item.id === "r|hy2|inbound|client|first|tcp|ipv4").status, "unobserved");
});

test("the namespace tool prints the checklist and still refuses host argv", () => {
  const script = fileURLToPath(new URL("../../scripts/bwh-bandwidth-namespace-proof.mjs", import.meta.url));
  const source = readFileSync(script, "utf8");
  const library = readFileSync(fileURLToPath(new URL("../services/platform/bwh-bandwidth-rate-proof.mjs", import.meta.url)), "utf8");
  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("spawn"), false);
  assert.equal(source.includes("exec"), false);
  assert.equal(library.includes("child_process"), false);
  assert.equal(library.includes("applyPlan"), false);
  assert.equal(library.includes("executeOwnedBandwidth"), false);
  const hostile = spawnSync(process.execPath, [script, "--tc", "ip", "ssh"], { encoding: "utf8" });
  assert.equal(hostile.status, 2);
  assert.equal(hostile.stderr, "");
  const body = JSON.parse(hostile.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.proven, false);
  assert.equal(body.classificationAttached, false);
  assert.equal(body.reason, "isolation_not_authorized");
  assert.equal(body.measurement, "not_run");
  assert.equal(body.refusals.some((item) => item.code === "host_argv_rejected"), true);
  assert.equal(body.counts.rateCells > 0, true);
  assert.equal(hostile.stdout.includes("ifb-gccgw-bwh"), false);
  assert.equal(hostile.stdout.includes("0xb100"), false);
  assert.equal(hostile.stdout.includes("xray-vless"), false);
  const authorized = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, BWH_ISOLATION_AUTHORIZED: "true" }
  });
  assert.equal(authorized.status, 2);
  assert.equal(JSON.parse(authorized.stdout).ok, false);
  assert.equal(JSON.parse(authorized.stdout).reason, "isolation_not_authorized");
  assert.equal(authorized.stderr, "");
});
