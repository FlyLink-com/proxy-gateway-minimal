import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  assertVerifiedNativeToolchain,
  createVerifiedNativeToolEnvironment,
  verifyNativeToolchainTree
} from "../../scripts/control-plane-native-toolchain-contract.mjs";

test("locks the reviewed Node-API build driver at node-gyp 11.4.2", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  const packageLock = JSON.parse(await readFile(new URL("../../package-lock.json", import.meta.url), "utf8"));

  assert.equal(packageJson.devDependencies["node-gyp"], "11.4.2");
  assert.equal(packageLock.packages[""].devDependencies["node-gyp"], "11.4.2");
  assert.equal(packageLock.packages["node_modules/node-gyp"].version, "11.4.2");
});

test("toolchain verifier refuses to treat a non-Linux development host as proof", () => {
  if (process.platform === "linux") return;

  assert.throws(() => verifyNativeToolchainTree({
    directory: "C:\\not-a-toolchain",
    manifestPath: "C:\\not-a-manifest",
    expectedSha256: "a".repeat(64),
    compileProfiles: []
  }), /native_toolchain_linux_required/);
});

test("narrow native build environment only accepts a verifier-branded toolchain", () => {
  const forged = Object.freeze({
    binDirectory: "/tmp/bin",
    compiler: { path: "/tmp/bin/cc" },
    cxx: { path: "/tmp/bin/c++" },
    archiver: { path: "/tmp/bin/ar" },
    linker: { path: "/tmp/bin/ld" },
    python: { path: "/tmp/bin/python3" },
    make: { path: "/tmp/bin/make" }
  });
  assert.throws(() => createVerifiedNativeToolEnvironment(forged), /verified_native_toolchain_brand_invalid/);
  assert.throws(() => assertVerifiedNativeToolchain(forged), /verified_native_toolchain_brand_invalid/);
});
