import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  ATOMIC_LOGICAL_RECORD_EXPORTS,
  FOUNDATION_NATIVE_EXPORTS,
  HARDENED_C17_PIE_V1_FLAGS,
  REQUIRED_LINUX_FEATURES
} from "../services/deployment/foundation-contract.mjs";
import * as native from "../../ops/control-plane-deploy/native/index.mjs";

test("native wrapper exports the closed Foundation operation set", () => {
  assert.deepEqual(Object.keys(native).sort(), FOUNDATION_NATIVE_EXPORTS);
  assert.deepEqual(ATOMIC_LOGICAL_RECORD_EXPORTS, [
    "durableReadLogical",
    "durablePublishNoReplace",
    "durableCompareAndSwap",
    "durableUnlinkVerified"
  ]);
  assert.equal(
    FOUNDATION_NATIVE_EXPORTS.every((operation) => typeof native[operation] === "function"),
    true
  );
  assert.deepEqual(HARDENED_C17_PIE_V1_FLAGS, [
    "-std=c17",
    "-O2",
    "-fPIE",
    "-pie",
    "-fstack-protector-strong",
    "-Wl,-z,relro,-z,now",
    "-Wall",
    "-Wextra",
    "-Werror"
  ]);
  assert.equal(REQUIRED_LINUX_FEATURES.length, 14);
});

test("wrapper fails closed before any native operation outside Linux", () => {
  if (process.platform === "linux") return;

  for (const operation of FOUNDATION_NATIVE_EXPORTS) {
    assert.throws(() => native[operation]({}), /native_linux_required/);
  }
});

test("Node-API registration table matches the same closed operation set", async () => {
  const source = await readFile(
    new URL("../../ops/control-plane-deploy/native/src/control-plane-native.c", import.meta.url),
    "utf8"
  );
  const registered = [...source.matchAll(/FOUNDATION_OPERATION\("([A-Za-z0-9]+)"\)/g)]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(registered, FOUNDATION_NATIVE_EXPORTS);
  assert.equal(source.includes("native_operation_not_implemented"), true);
});
