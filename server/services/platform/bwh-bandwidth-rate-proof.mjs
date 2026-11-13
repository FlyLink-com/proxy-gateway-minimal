import { bandwidthClassificationTopology } from "./bwh-bandwidth-classification.mjs";
import { BWH_SHARED_BANDWIDTH_PROFILE as PROFILE } from "./bwh-shared-bandwidth.mjs";

// Checklist for a future authorized shared-rate run. This module does not
// open a socket, run tc/ip, or accept a paper counter as a measurement.
export const SHARED_RATE_CONTRACT = Object.freeze({
  offeredLoadRatio: 2,
  warmupMs: 3000,
  steadyMs: 10000,
  burst: "excluded-from-steady",
  toleranceMilli: 100
});

const FAULTS = Object.freeze([
  "partial-apply", "command-timeout", "readback-error", "persistence-failure",
  "object-conflict", "rollback-failure", "restart", "cleanup"
]);
const SAMPLE_KEYS = Object.freeze([
  "load", "direction", "leg", "phase", "transport", "family",
  "offeredBps", "sharedBps", "warmupBytes", "steadyBytes", "steadyMs", "connections", "lossIncreased"
]);
const EXEMPT_KEYS = Object.freeze(["className", "direction", "family", "queue"]);
const SHORTCUTS = Object.freeze([
  ["ok", "fixed_success"],
  ["success", "fixed_success"],
  ["classificationAttached", "boolean_not_rate"],
  ["applied", "desired_is_not_measurement"],
  ["state", "desired_is_not_measurement"],
  ["payloadBytes", "single_connection_payload"],
  ["singleConnection", "single_connection_payload"],
  ["lossIncreased", "loss_is_not_rate"],
  ["packetLoss", "loss_is_not_rate"],
  ["command", "host_command_not_authorized"],
  ["argv", "host_command_not_authorized"],
  ["namespace", "host_command_not_authorized"],
  ["burstIncluded", "burst_not_excluded"]
]);

function exact(value, keys) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function boundBytes(sharedBps, upper) {
  const milli = BigInt(upper ? 1000 + SHARED_RATE_CONTRACT.toleranceMilli : 1000 - SHARED_RATE_CONTRACT.toleranceMilli);
  const numerator = BigInt(sharedBps) * BigInt(SHARED_RATE_CONTRACT.steadyMs) * milli;
  const denominator = 8000000n;
  return upper ? (numerator + denominator - 1n) / denominator : numerator / denominator;
}

export function sharedRateTopology() {
  const classification = bandwidthClassificationTopology();
  const loads = Object.freeze([...classification.protocols.map((item) => item.id), "all"]);
  const rateCells = [];
  for (const load of loads) {
    for (const direction of classification.directions) {
      for (const leg of classification.legs) {
        for (const phase of classification.phases) {
          for (const transport of classification.transports) {
            for (const family of classification.families) {
              rateCells.push(Object.freeze({
                id: `r|${load}|${direction}|${leg}|${phase}|${transport}|${family}`,
                kind: "rate", load, direction, leg, phase, transport, family
              }));
            }
          }
        }
      }
    }
  }
  const exemptions = [];
  for (const className of classification.exemptions) {
    for (const direction of classification.directions) {
      for (const family of classification.families) {
        exemptions.push(Object.freeze({
          id: `x|${className}|${direction}|${family}`,
          kind: "exemption", className, direction, family
        }));
      }
    }
  }
  const faults = FAULTS.map((name) => Object.freeze({ id: `f|${name}`, kind: "fault", name }));
  return Object.freeze({
    loads, faults: FAULTS, contract: SHARED_RATE_CONTRACT,
    directions: classification.directions,
    legs: classification.legs,
    phases: classification.phases,
    transports: classification.transports,
    families: classification.families,
    exemptions: classification.exemptions,
    queues: classification.queues,
    rateCells: Object.freeze(rateCells),
    exemptionCells: Object.freeze(exemptions),
    faultCells: Object.freeze(faults)
  });
}

function blankItem(cell) {
  return { id: cell.id, kind: cell.kind, status: "unobserved", reason: "isolation_not_authorized" };
}

function markRefused(index, refusals, code, itemId) {
  refusals.push(itemId ? { code, itemId } : { code });
  const item = itemId ? index.get(itemId) : undefined;
  if (item && item.status === "unobserved") {
    item.status = "refused";
    item.reason = code;
  }
}

function considerSample(sample, topology, index, refusals, budgets) {
  if (!exact(sample, SAMPLE_KEYS)) {
    markRefused(index, refusals, "invalid_sample");
    return;
  }
  const known = topology.rateCells.find((cell) => cell.load === sample.load && cell.direction === sample.direction
    && cell.leg === sample.leg && cell.phase === sample.phase && cell.transport === sample.transport
    && cell.family === sample.family);
  const itemId = known?.id;
  const integers = ["offeredBps", "sharedBps", "warmupBytes", "steadyBytes", "steadyMs", "connections"];
  if (!known || integers.some((key) => !Number.isSafeInteger(sample[key]) || sample[key] < 0)
    || typeof sample.lossIncreased !== "boolean"
    || sample.sharedBps < PROFILE.minEnabledBps || sample.sharedBps > PROFILE.maxBps) {
    markRefused(index, refusals, "invalid_sample", itemId);
    return;
  }
  const previous = budgets.get(sample.direction);
  if (previous !== undefined && previous !== sample.sharedBps) {
    markRefused(index, refusals, "shared_budget_drift", itemId);
    return;
  }
  budgets.set(sample.direction, sample.sharedBps);
  if (sample.steadyMs !== SHARED_RATE_CONTRACT.steadyMs) {
    markRefused(index, refusals, "window_not_separated", itemId);
    return;
  }
  if (sample.offeredBps < sample.sharedBps * SHARED_RATE_CONTRACT.offeredLoadRatio) {
    markRefused(index, refusals, "offered_load_short", itemId);
    return;
  }
  if (sample.connections < 2) {
    markRefused(index, refusals, "single_connection_payload", itemId);
    return;
  }
  if (sample.lossIncreased) {
    markRefused(index, refusals, "loss_is_not_rate", itemId);
    return;
  }
  const bytes = BigInt(sample.steadyBytes);
  if (bytes > boundBytes(sample.sharedBps, true)) {
    markRefused(index, refusals, sample.load === "all" ? "budget_not_shared" : "above_shared_ceiling", itemId);
    return;
  }
  refusals.push({ code: "synthetic_counter_not_measurement", itemId });
}

export function observeSharedRateProof(input) {
  const topology = sharedRateTopology();
  const items = [...topology.rateCells, ...topology.exemptionCells, ...topology.faultCells].map(blankItem);
  const index = new Map(items.map((item) => [item.id, item]));
  const refusals = [];
  const report = input === undefined || input === null ? {} : input;
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    markRefused(index, refusals, "invalid_report");
  } else {
    if (Array.isArray(report.rejectedArgv) && report.rejectedArgv.length > 0) {
      markRefused(index, refusals, "host_argv_rejected");
    }
    for (const [key, code] of SHORTCUTS) {
      if (Object.hasOwn(report, key) && report[key]) markRefused(index, refusals, code);
    }
    if (Object.hasOwn(report, "toleranceMilli") && report.toleranceMilli !== SHARED_RATE_CONTRACT.toleranceMilli) {
      markRefused(index, refusals, "tolerance_widened");
    }
    if (Object.hasOwn(report, "warmupMs") && report.warmupMs !== SHARED_RATE_CONTRACT.warmupMs) {
      markRefused(index, refusals, "window_not_separated");
    }
    if (Object.hasOwn(report, "steadyMs") && report.steadyMs !== SHARED_RATE_CONTRACT.steadyMs) {
      markRefused(index, refusals, "window_not_separated");
    }
    if (Object.hasOwn(report, "samples")) {
      if (!Array.isArray(report.samples) || report.samples.length > topology.rateCells.length) {
        markRefused(index, refusals, "invalid_sample");
      } else {
        const budgets = new Map();
        for (const sample of report.samples) considerSample(sample, topology, index, refusals, budgets);
      }
    }
    if (Object.hasOwn(report, "exemptions")) {
      if (!Array.isArray(report.exemptions)) markRefused(index, refusals, "invalid_sample");
      else {
        for (const claim of report.exemptions) {
          if (!exact(claim, EXEMPT_KEYS)) {
            markRefused(index, refusals, "invalid_sample");
            continue;
          }
          const cell = topology.exemptionCells.find((item) => item.className === claim.className
            && item.direction === claim.direction && item.family === claim.family);
          if (!cell) {
            markRefused(index, refusals, "invalid_sample");
            continue;
          }
          if (claim.queue === topology.queues.inbound || claim.queue === topology.queues.outbound) {
            markRefused(index, refusals, "exemption_leak", cell.id);
          } else if (claim.queue === topology.queues.exempt) {
            refusals.push({ code: "synthetic_counter_not_measurement", itemId: cell.id });
          } else markRefused(index, refusals, "invalid_sample", cell.id);
        }
      }
    }
    if (Object.hasOwn(report, "faults")) {
      if (!report.faults || typeof report.faults !== "object" || Array.isArray(report.faults)) {
        markRefused(index, refusals, "invalid_sample");
      } else {
        for (const [name, value] of Object.entries(report.faults)) {
          const cell = topology.faultCells.find((item) => item.name === name);
          if (!cell) markRefused(index, refusals, "invalid_sample");
          else if (value === true) markRefused(index, refusals, "fault_success_not_proof", cell.id);
          else refusals.push({ code: "synthetic_fault_not_a_run", itemId: cell.id });
        }
      }
    }
  }
  const refused = items.filter((item) => item.status === "refused").length;
  return {
    ok: false,
    proven: false,
    classificationAttached: false,
    reason: "isolation_not_authorized",
    measurement: "not_run",
    contract: SHARED_RATE_CONTRACT,
    sharedBudgets: { inbound: topology.queues.inbound, outbound: topology.queues.outbound, perProtocol: false },
    counts: {
      rateCells: topology.rateCells.length,
      exemptions: topology.exemptionCells.length,
      faults: topology.faultCells.length,
      unobserved: items.length - refused,
      refused
    },
    refusals,
    items
  };
}
