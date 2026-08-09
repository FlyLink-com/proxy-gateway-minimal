import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { sha256Hex } from "../services/deployment/canonical-json.mjs";
import {
  compileReviewedNativeRegistryFixture,
  NATIVE_REGISTRY_MANIFEST,
  NATIVE_SOURCE_ROOT
} from "../../scripts/control-plane-native-registry.mjs";

async function writeFixtureJson(path, value) {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  await writeFile(path, bytes);
  return sha256Hex(bytes);
}

async function createFixture({ extraRegistryEntry = false, sourceDigestDrift = false } = {}) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "control-plane-native-registry-"));
  const nativeRoot = join(repositoryRoot, "ops", "control-plane-deploy", "native");
  const registryRoot = join(nativeRoot, "registry");
  const sourceRoot = join(nativeRoot, "src");
  const outputDirectory = join(repositoryRoot, "output");
  await mkdir(registryRoot, { recursive: true });
  await mkdir(sourceRoot, { recursive: true });
  await mkdir(outputDirectory);

  const profileSource = Buffer.from("int main(void) { return 0; }\n", "utf8");
  const contractSource = Buffer.from("int main(void) { return 1; }\n", "utf8");
  await writeFile(join(sourceRoot, "foundation-profile-probe.c"), profileSource);
  await writeFile(join(sourceRoot, "native-contract-test.c"), contractSource);

  const fragments = [
    ["logical_records", "foundation-logical-records.json", {
      schemaVersion: 1,
      fragmentType: "logical_records",
      ownerId: "foundation",
      logicalRecords: [{
        logicalId: "foundation-test-rotation-journal-v1",
        recordName: "rotation.json",
        lockName: "rotation.lock",
        replayMarkerName: "rotation.replay",
        maxBytes: 1024,
        mode: "0600"
      }]
    }],
    ["spawn_profiles", "foundation-profiles.json", {
      schemaVersion: 1,
      fragmentType: "spawn_profiles",
      ownerId: "foundation",
      spawnProfiles: [{
        executableId: "foundation-fd-probe",
        environmentId: "empty",
        standaloneTargetId: "foundation-profile-probe",
        arguments: [],
        descriptorRoles: [],
        timeoutCapMs: 5000,
        environment: []
      }]
    }],
    ["compile_profiles", "foundation-compile-profiles.json", {
      schemaVersion: 1,
      fragmentType: "compile_profiles",
      ownerId: "foundation",
      compileProfiles: [{
        compileProfileId: "hardened-c17-pie-v1",
        toolchainId: "fixture-toolchain-v1",
        compilerRelativePath: "bin/cc",
        compilerSha256: "a".repeat(64),
        flags: [
          "-std=c17", "-O2", "-fPIE", "-pie", "-fstack-protector-strong",
          "-Wl,-z,relro,-z,now", "-Wall", "-Wextra", "-Werror"
        ]
      }]
    }],
    ["standalone_targets", "foundation-standalone-targets.json", {
      schemaVersion: 1,
      fragmentType: "standalone_targets",
      ownerId: "foundation",
      standaloneTargets: [
        {
          targetId: "foundation-native-contract-test",
          compileProfileId: "hardened-c17-pie-v1",
          outputName: "foundation-native-contract-test",
          source: "src/native-contract-test.c",
          sourceSha256: sha256Hex(contractSource)
        },
        {
          targetId: "foundation-profile-probe",
          compileProfileId: "hardened-c17-pie-v1",
          outputName: "foundation-profile-probe",
          source: "src/foundation-profile-probe.c",
          sourceSha256: sourceDigestDrift ? "b".repeat(64) : sha256Hex(profileSource)
        }
      ]
    }]
  ];
  const manifestFragments = [];
  for (const [kind, name, value] of fragments) {
    manifestFragments.push({ kind, name, sha256: await writeFixtureJson(join(registryRoot, name), value) });
  }
  await writeFixtureJson(join(registryRoot, "reviewed-native-registry-manifest.json"), {
    schemaVersion: 1,
    registryId: "control-plane-native-registry-v1",
    fragments: manifestFragments
  });
  if (extraRegistryEntry) await writeFile(join(registryRoot, "unreviewed.json"), "{}\n");
  return { repositoryRoot, outputDirectory };
}

async function withFixture(options, action) {
  const fixture = await createFixture(options);
  try {
    return await action(fixture);
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
  }
}

test("compiles only the manifest-reviewed native registry", async () => {
  await withFixture({}, async ({ repositoryRoot, outputDirectory }) => {
    const compiled = compileReviewedNativeRegistryFixture({
      repositoryRoot,
      sourceRoot: NATIVE_SOURCE_ROOT,
      manifestPath: NATIVE_REGISTRY_MANIFEST,
      outputDirectory
    });

    assert.equal(compiled.sourceRoot, NATIVE_SOURCE_ROOT);
    assert.equal(compiled.manifestPath, NATIVE_REGISTRY_MANIFEST);
    assert.deepEqual(compiled.executableIds, ["foundation-fd-probe"]);
    assert.deepEqual(compiled.environmentIds, ["empty"]);
    assert.deepEqual(compiled.compileProfiles.map(({ compileProfileId }) => compileProfileId), [
      "hardened-c17-pie-v1"
    ]);
    assert.deepEqual(compiled.standaloneTargets.map(({ targetId }) => targetId), [
      "foundation-native-contract-test",
      "foundation-profile-probe"
    ]);
    assert.match(compiled.registrySha256, /^[a-f0-9]{64}$/);
    assert.match(await readFile(compiled.generatedHeaderPath, "utf8"), /CONTROL_PLANE_NATIVE_REGISTRY_SHA256/);
    assert.equal((await readFile(compiled.buildPlanPath)).length > 0, true);
  });
});

test("rejects an unregistered registry entry before compiling anything", async () => {
  await withFixture({ extraRegistryEntry: true }, async ({ repositoryRoot, outputDirectory }) => {
    assert.throws(() => compileReviewedNativeRegistryFixture({
      repositoryRoot,
      sourceRoot: NATIVE_SOURCE_ROOT,
      manifestPath: NATIVE_REGISTRY_MANIFEST,
      outputDirectory
    }), /native_registry_entry_unregistered/);
  });
});

test("rejects a reviewed source whose digest drifts", async () => {
  await withFixture({ sourceDigestDrift: true }, async ({ repositoryRoot, outputDirectory }) => {
    assert.throws(() => compileReviewedNativeRegistryFixture({
      repositoryRoot,
      sourceRoot: NATIVE_SOURCE_ROOT,
      manifestPath: NATIVE_REGISTRY_MANIFEST,
      outputDirectory
    }), /native_standalone_source_digest_mismatch/);
  });
});

test("rejects caller-selected production registry paths", async () => {
  await withFixture({}, async ({ repositoryRoot, outputDirectory }) => {
    assert.throws(() => compileReviewedNativeRegistryFixture({
      repositoryRoot,
      sourceRoot: "ops/control-plane-deploy/other",
      manifestPath: NATIVE_REGISTRY_MANIFEST,
      outputDirectory
    }), /native_registry_source_root_invalid/);
    assert.throws(() => compileReviewedNativeRegistryFixture({
      repositoryRoot,
      sourceRoot: NATIVE_SOURCE_ROOT,
      manifestPath: "ops/control-plane-deploy/native/registry/other.json",
      outputDirectory
    }), /native_registry_manifest_path_invalid/);
  });
});
