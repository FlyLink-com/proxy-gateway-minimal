import assert from "node:assert/strict";
import { test } from "node:test";

import { REQUIRED_LINUX_FEATURES } from "../services/deployment/foundation-contract.mjs";
import {
  buildCapabilityReceipt,
  serializeCapabilityReceiptLine
} from "../../scripts/control-plane-linux-capability-probe.mjs";

const EXPECTED_LINUX_FEATURES = Object.freeze([
  "memfdOwnerMode0600",
  "memfdFullSeals",
  "sealedOpenSshDescriptorHandoff",
  "exactDescriptorInheritance",
  "atomicLogicalStateTransitions",
  "openat2BeneathNoFollow",
  "ofdIdentityLease",
  "reviewedSpawnProfileRegistry",
  "scmRightsPeerBound",
  "sqliteActualMainHandle",
  "directoryFsyncDurability",
  "systemdTemplateIsolation",
  "systemdPersistentTimer",
  "cgroupKillReadback"
]);

function allPassProbe() {
  return Object.fromEntries(REQUIRED_LINUX_FEATURES.map((name) => [name, true]));
}

test("reports only the closed aggregate feature map", () => {
  const receipt = buildCapabilityReceipt(allPassProbe);

  assert.deepEqual(REQUIRED_LINUX_FEATURES, EXPECTED_LINUX_FEATURES);
  assert.deepEqual(Object.keys(receipt), ["schemaVersion", "receiptType", "eligible", "features"]);
  assert.deepEqual(Object.keys(receipt.features), REQUIRED_LINUX_FEATURES);
  assert.equal(Object.values(receipt.features).every(Boolean), true);
  assert.equal(receipt.eligible, true);
  assert.equal(JSON.stringify(receipt).includes("/"), false);
});

test("missing, false, or non-boolean observations fail closed", () => {
  for (const observed of [
    {},
    { ...allPassProbe(), memfdFullSeals: false },
    { ...allPassProbe(), memfdFullSeals: 1 }
  ]) {
    const receipt = buildCapabilityReceipt(() => observed);
    assert.equal(receipt.eligible, false);
    assert.equal(receipt.features.memfdFullSeals, false);
  }
});

test("canonical CLI line has one LF and no host-detail fields", () => {
  const line = serializeCapabilityReceiptLine(buildCapabilityReceipt(allPassProbe));

  assert.equal(line.at(-1), 0x0a);
  assert.equal(line.subarray(0, -1).includes(0x0a), false);
  const text = line.toString("utf8");
  for (const forbidden of ["path", "kernel", "hostname", "uid", "pid", "device", "inode", "config", "credential"]) {
    assert.equal(text.toLowerCase().includes(forbidden), false);
  }
});
