import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { probeLinuxCapabilities } from "../ops/control-plane-deploy/native/index.mjs";
import { serializeCanonicalJsonBytes } from "../server/services/deployment/canonical-json.mjs";
import { REQUIRED_LINUX_FEATURES } from "../server/services/deployment/foundation-contract.mjs";

const FEATURES_CONTRACT = Object.freeze({
  schemaId: "control_plane_linux_feasibility_features_v1",
  maxBytes: 4096,
  fieldOrder: REQUIRED_LINUX_FEATURES,
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (REQUIRED_LINUX_FEATURES.some((name) => typeof value[name] !== "boolean")) {
      throw new Error("linux_feasibility_feature_invalid");
    }
  }
});

const RECEIPT_CONTRACT = Object.freeze({
  schemaId: "control_plane_linux_feasibility_receipt_v1",
  maxBytes: 4096,
  fieldOrder: Object.freeze(["schemaVersion", "receiptType", "eligible", "features"]),
  nested: Object.freeze({ features: FEATURES_CONTRACT }),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schemaVersion !== "1"
        || value.receiptType !== "control_plane_linux_feasibility"
        || typeof value.eligible !== "boolean") {
      throw new Error("linux_feasibility_receipt_invalid");
    }
  }
});

export function buildCapabilityReceipt(aggregateProbe) {
  if (typeof aggregateProbe !== "function") throw new Error("linux_feasibility_probe_invalid");
  const observed = aggregateProbe();
  if (observed === null || typeof observed !== "object" || Array.isArray(observed)) {
    throw new Error("linux_feasibility_observation_invalid");
  }
  const features = Object.freeze(Object.fromEntries(
    REQUIRED_LINUX_FEATURES.map((name) => [name, observed[name] === true])
  ));
  return Object.freeze({
    schemaVersion: "1",
    receiptType: "control_plane_linux_feasibility",
    eligible: Object.values(features).every(Boolean),
    features
  });
}

export function serializeCapabilityReceiptLine(receipt) {
  return Buffer.concat([
    serializeCanonicalJsonBytes(receipt, RECEIPT_CONTRACT),
    Buffer.from("\n", "utf8")
  ]);
}

async function main() {
  try {
    const observed = await probeLinuxCapabilities();
    const receipt = buildCapabilityReceipt(() => observed);
    process.stdout.write(serializeCapabilityReceiptLine(receipt));
    if (!receipt.eligible) {
      process.stderr.write("control_plane_linux_feasibility_ineligible\n");
      process.exitCode = 1;
    }
  } catch {
    process.stderr.write("control_plane_linux_capability_probe_failed\n");
    process.exitCode = 1;
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) await main();
