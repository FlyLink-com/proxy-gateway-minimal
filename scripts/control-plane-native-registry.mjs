import { lstatSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { serializeCanonicalJsonBytes, parseCanonicalJsonBytes, sha256Hex } from "../server/services/deployment/canonical-json.mjs";
import { FOUNDATION_NATIVE_EXPORTS, HARDENED_C17_PIE_V1_FLAGS } from "../server/services/deployment/foundation-contract.mjs";

export const NATIVE_SOURCE_ROOT = "ops/control-plane-deploy/native";
export const NATIVE_REGISTRY_MANIFEST =
  "ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_FRAGMENT_KINDS = Object.freeze([
  "logical_records",
  "spawn_profiles",
  "compile_profiles",
  "standalone_targets"
]);
const SOURCE_PATTERN = /^src\/[a-z0-9][a-z0-9-]{0,63}\.c$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FRAGMENT_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}\.json$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function frozenContract(schemaId, fieldOrder, { nested = {}, arrays = {}, validate = () => {} } = {}) {
  return Object.freeze({
    schemaId,
    maxBytes: 128 * 1024,
    fieldOrder: Object.freeze([...fieldOrder]),
    nested: Object.freeze({ ...nested }),
    arrays: Object.freeze({ ...arrays }),
    validate
  });
}

function assertId(value, code) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(code);
}

function assertSha256(value, code) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw new Error(code);
}

const MANIFEST_FRAGMENT_CONTRACT = frozenContract(
  "reviewed_native_registry_manifest_fragment_v1",
  ["kind", "name", "sha256"],
  {
    validate(value) {
      if (![...BASE_FRAGMENT_KINDS, "native_extension"].includes(value.kind)
          || typeof value.name !== "string"
          || !FRAGMENT_PATTERN.test(value.name)
          || value.name === "reviewed-native-registry-manifest.json") {
        throw new Error("native_registry_manifest_fragment_invalid");
      }
      assertSha256(value.sha256, "native_registry_manifest_fragment_invalid");
    }
  }
);

const MANIFEST_CONTRACT = frozenContract(
  "reviewed_native_registry_manifest_v1",
  ["schemaVersion", "registryId", "fragments"],
  {
    nested: { fragment: MANIFEST_FRAGMENT_CONTRACT },
    arrays: { fragments: "fragment" },
    validate(value) {
      if (value.schemaVersion !== 1 || value.registryId !== "control-plane-native-registry-v1"
          || value.fragments.length === 0) {
        throw new Error("native_registry_manifest_invalid");
      }
    }
  }
);

const LOGICAL_RECORD_CONTRACT = frozenContract(
  "reviewed_native_logical_record_v1",
  ["logicalId", "recordName", "lockName", "replayMarkerName", "maxBytes", "mode"],
  {
    validate(value) {
      assertId(value.logicalId, "native_registry_logical_record_invalid");
      for (const field of ["recordName", "lockName", "replayMarkerName"]) {
        if (typeof value[field] !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value[field])) {
          throw new Error("native_registry_logical_record_invalid");
        }
      }
      if (!Number.isSafeInteger(value.maxBytes) || value.maxBytes <= 0 || value.mode !== "0600") {
        throw new Error("native_registry_logical_record_invalid");
      }
    }
  }
);

const LOGICAL_RECORDS_FRAGMENT_CONTRACT = frozenContract(
  "reviewed_native_logical_records_fragment_v1",
  ["schemaVersion", "fragmentType", "ownerId", "logicalRecords"],
  {
    nested: { record: LOGICAL_RECORD_CONTRACT },
    arrays: { logicalRecords: "record" },
    validate(value) {
      if (value.schemaVersion !== 1 || value.fragmentType !== "logical_records" || value.ownerId !== "foundation") {
        throw new Error("native_registry_logical_records_fragment_invalid");
      }
    }
  }
);

const SPAWN_PROFILE_CONTRACT = frozenContract(
  "reviewed_native_spawn_profile_v1",
  ["executableId", "environmentId", "standaloneTargetId", "arguments", "descriptorRoles", "timeoutCapMs", "environment"],
  {
    arrays: {
      arguments: Object.freeze({ elementType: "string" }),
      descriptorRoles: Object.freeze({ elementType: "string" }),
      environment: Object.freeze({ elementType: "string" })
    },
    validate(value) {
      assertId(value.executableId, "native_registry_spawn_profile_invalid");
      assertId(value.environmentId, "native_registry_spawn_profile_invalid");
      assertId(value.standaloneTargetId, "native_registry_spawn_profile_invalid");
      if (!Number.isSafeInteger(value.timeoutCapMs) || value.timeoutCapMs <= 0 || value.timeoutCapMs > 30_000) {
        throw new Error("native_registry_spawn_profile_invalid");
      }
      if (value.arguments.some((argument) => argument.startsWith("-"))) {
        throw new Error("native_registry_spawn_profile_invalid");
      }
    }
  }
);

const SPAWN_PROFILES_FRAGMENT_CONTRACT = frozenContract(
  "reviewed_native_spawn_profiles_fragment_v1",
  ["schemaVersion", "fragmentType", "ownerId", "spawnProfiles"],
  {
    nested: { profile: SPAWN_PROFILE_CONTRACT },
    arrays: { spawnProfiles: "profile" },
    validate(value) {
      if (value.schemaVersion !== 1 || value.fragmentType !== "spawn_profiles" || value.ownerId !== "foundation") {
        throw new Error("native_registry_spawn_profiles_fragment_invalid");
      }
    }
  }
);

const COMPILE_PROFILE_CONTRACT = frozenContract(
  "reviewed_native_compile_profile_v1",
  ["compileProfileId", "toolchainId", "compilerRelativePath", "compilerSha256", "flags"],
  {
    arrays: { flags: Object.freeze({ elementType: "string" }) },
    validate(value) {
      assertId(value.compileProfileId, "native_registry_compile_profile_invalid");
      assertId(value.toolchainId, "native_registry_compile_profile_invalid");
      assertSha256(value.compilerSha256, "native_registry_compile_profile_invalid");
      if (value.compilerRelativePath !== "bin/cc"
          || value.compileProfileId !== "hardened-c17-pie-v1"
          || value.flags.length !== HARDENED_C17_PIE_V1_FLAGS.length
          || value.flags.some((flag, index) => flag !== HARDENED_C17_PIE_V1_FLAGS[index])) {
        throw new Error("native_registry_compile_profile_invalid");
      }
    }
  }
);

const COMPILE_PROFILES_FRAGMENT_CONTRACT = frozenContract(
  "reviewed_native_compile_profiles_fragment_v1",
  ["schemaVersion", "fragmentType", "ownerId", "compileProfiles"],
  {
    nested: { profile: COMPILE_PROFILE_CONTRACT },
    arrays: { compileProfiles: "profile" },
    validate(value) {
      if (value.schemaVersion !== 1 || value.fragmentType !== "compile_profiles" || value.ownerId !== "foundation") {
        throw new Error("native_registry_compile_profiles_fragment_invalid");
      }
    }
  }
);

const STANDALONE_TARGET_CONTRACT = frozenContract(
  "reviewed_native_standalone_target_v1",
  ["targetId", "compileProfileId", "outputName", "source", "sourceSha256"],
  {
    validate(value) {
      assertId(value.targetId, "native_registry_standalone_target_invalid");
      assertId(value.compileProfileId, "native_registry_standalone_target_invalid");
      assertId(value.outputName, "native_registry_standalone_target_invalid");
      if (!SOURCE_PATTERN.test(value.source)) throw new Error("native_registry_standalone_target_invalid");
      assertSha256(value.sourceSha256, "native_registry_standalone_target_invalid");
    }
  }
);

const STANDALONE_TARGETS_FRAGMENT_CONTRACT = frozenContract(
  "reviewed_native_standalone_targets_fragment_v1",
  ["schemaVersion", "fragmentType", "ownerId", "standaloneTargets"],
  {
    nested: { target: STANDALONE_TARGET_CONTRACT },
    arrays: { standaloneTargets: "target" },
    validate(value) {
      if (value.schemaVersion !== 1 || value.fragmentType !== "standalone_targets" || value.ownerId !== "foundation") {
        throw new Error("native_registry_standalone_targets_fragment_invalid");
      }
    }
  }
);

const FRAGMENT_CONTRACTS = Object.freeze({
  logical_records: LOGICAL_RECORDS_FRAGMENT_CONTRACT,
  spawn_profiles: SPAWN_PROFILES_FRAGMENT_CONTRACT,
  compile_profiles: COMPILE_PROFILES_FRAGMENT_CONTRACT,
  standalone_targets: STANDALONE_TARGETS_FRAGMENT_CONTRACT
});

function assertRegularFile(path, code) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(code);
}

function assertDirectory(path, code) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(code);
}

function assertExactRelativePath(value, expected, code) {
  if (value !== expected) throw new Error(code);
}

function assertUnique(values, code) {
  if (new Set(values).size !== values.length) throw new Error(code);
}

function assertWithin(root, path, code) {
  const relativePath = relative(root, path);
  if (relativePath === "" || relativePath.startsWith(`..${sep}`) || relativePath === ".." || relativePath.includes(`..${sep}`)) {
    throw new Error(code);
  }
}

function readCanonical(path, contract, code) {
  assertRegularFile(path, code);
  const bytes = readFileSync(path);
  return Object.freeze({ bytes, value: parseCanonicalJsonBytes(bytes, contract) });
}

function compileRegistry({ repositoryRoot, sourceRoot, manifestPath, outputDirectory }) {
  assertExactRelativePath(sourceRoot, NATIVE_SOURCE_ROOT, "native_registry_source_root_invalid");
  assertExactRelativePath(manifestPath, NATIVE_REGISTRY_MANIFEST, "native_registry_manifest_path_invalid");

  const nativeRoot = resolve(repositoryRoot, sourceRoot);
  const registryRoot = join(nativeRoot, "registry");
  const sourceDirectory = join(nativeRoot, "src");
  const resolvedManifestPath = resolve(repositoryRoot, manifestPath);
  assertDirectory(nativeRoot, "native_registry_native_root_invalid");
  assertDirectory(registryRoot, "native_registry_root_invalid");
  assertDirectory(sourceDirectory, "native_registry_source_directory_invalid");
  if (dirname(resolvedManifestPath) !== registryRoot) throw new Error("native_registry_manifest_path_invalid");
  assertDirectory(outputDirectory, "native_registry_output_directory_invalid");
  if (realpathSync(outputDirectory) !== resolve(outputDirectory)) {
    throw new Error("native_registry_output_directory_invalid");
  }

  const manifest = readCanonical(resolvedManifestPath, MANIFEST_CONTRACT, "native_registry_manifest_invalid");
  assertUnique(manifest.value.fragments.map(({ name }) => name), "native_registry_manifest_duplicate_fragment");
  assertUnique(manifest.value.fragments.map(({ kind }) => kind), "native_registry_manifest_duplicate_kind");
  if (manifest.value.fragments.length !== BASE_FRAGMENT_KINDS.length
      || BASE_FRAGMENT_KINDS.some((kind) => !manifest.value.fragments.some((fragment) => fragment.kind === kind))) {
    throw new Error("native_registry_manifest_base_fragment_missing");
  }

  const allowedRegistryEntries = new Set([
    "reviewed-native-registry-manifest.json",
    ...manifest.value.fragments.map(({ name }) => name)
  ]);
  for (const entry of readdirSync(registryRoot, { withFileTypes: true })) {
    const entryPath = join(registryRoot, entry.name);
    if (!allowedRegistryEntries.has(entry.name) || entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error("native_registry_entry_unregistered");
    }
    assertRegularFile(entryPath, "native_registry_entry_unregistered");
  }

  const fragments = [];
  for (const entry of manifest.value.fragments) {
    const fragmentPath = join(registryRoot, entry.name);
    assertWithin(registryRoot, fragmentPath, "native_registry_fragment_path_invalid");
    const contract = FRAGMENT_CONTRACTS[entry.kind];
    if (!contract) throw new Error("native_registry_fragment_kind_invalid");
    const fragment = readCanonical(fragmentPath, contract, "native_registry_fragment_invalid");
    if (sha256Hex(fragment.bytes) !== entry.sha256) throw new Error("native_registry_fragment_digest_mismatch");
    fragments.push(Object.freeze({ ...entry, ...fragment }));
  }

  const fragmentByKind = Object.fromEntries(fragments.map((fragment) => [fragment.kind, fragment.value]));
  const logicalRecords = fragmentByKind.logical_records.logicalRecords;
  const spawnProfiles = fragmentByKind.spawn_profiles.spawnProfiles;
  const compileProfiles = fragmentByKind.compile_profiles.compileProfiles;
  const standaloneTargets = fragmentByKind.standalone_targets.standaloneTargets.map((target) => {
    const resolvedSourcePath = resolve(nativeRoot, target.source);
    assertWithin(sourceDirectory, resolvedSourcePath, "native_standalone_source_path_invalid");
    if (dirname(resolvedSourcePath) !== sourceDirectory) throw new Error("native_standalone_source_path_invalid");
    assertRegularFile(resolvedSourcePath, "native_standalone_source_missing");
    if (sha256Hex(readFileSync(resolvedSourcePath)) !== target.sourceSha256) {
      throw new Error("native_standalone_source_digest_mismatch");
    }
    return Object.freeze({ ...target, resolvedSourcePath });
  });

  assertUnique(logicalRecords.map(({ logicalId }) => logicalId), "native_registry_logical_id_duplicate");
  assertUnique(spawnProfiles.map(({ executableId }) => executableId), "native_registry_executable_id_duplicate");
  assertUnique(spawnProfiles.map(({ environmentId }) => environmentId), "native_registry_environment_id_duplicate");
  assertUnique(compileProfiles.map(({ compileProfileId }) => compileProfileId), "native_registry_compile_profile_duplicate");
  assertUnique(standaloneTargets.map(({ targetId }) => targetId), "native_registry_target_id_duplicate");
  assertUnique(standaloneTargets.map(({ outputName }) => outputName), "native_registry_output_name_duplicate");
  for (const profile of spawnProfiles) {
    if (!standaloneTargets.some(({ targetId }) => targetId === profile.standaloneTargetId)) {
      throw new Error("native_registry_spawn_target_unknown");
    }
  }
  for (const target of standaloneTargets) {
    if (!compileProfiles.some(({ compileProfileId }) => compileProfileId === target.compileProfileId)) {
      throw new Error("native_registry_target_profile_unknown");
    }
  }

  const compiledTables = Object.freeze({
    logicalRecords,
    spawnProfiles,
    compileProfiles,
    standaloneTargets: standaloneTargets.map(({ resolvedSourcePath, ...target }) => target)
  });
  const registrySha256 = sha256Hex(Buffer.from(JSON.stringify({
    manifestSha256: sha256Hex(manifest.bytes),
    fragments: fragments.map(({ kind, name, sha256 }) => ({ kind, name, sha256 })),
    compiledTables
  }), "utf8"));
  const generatedHeaderPath = join(outputDirectory, "compiled-native-registry.h");
  const buildPlanPath = join(outputDirectory, "reviewed-standalone-build-plan.json");
  const generatedHeader = [
    "#ifndef CONTROL_PLANE_COMPILED_NATIVE_REGISTRY_H",
    "#define CONTROL_PLANE_COMPILED_NATIVE_REGISTRY_H",
    `#define CONTROL_PLANE_NATIVE_REGISTRY_SHA256 \"${registrySha256}\"`,
    "#endif",
    ""
  ].join("\n");
  writeFileSync(generatedHeaderPath, generatedHeader, { encoding: "utf8", flag: "wx", mode: 0o600 });
  writeFileSync(
    buildPlanPath,
    serializeCanonicalJsonBytes({
      registryId: "control-plane-native-registry-v1",
      registrySha256,
      standaloneTargets: standaloneTargets.map(({ targetId, compileProfileId, outputName, source, sourceSha256 }) => ({
        targetId,
        compileProfileId,
        outputName,
        source,
        sourceSha256
      }))
    },
    frozenContract(
      "reviewed_standalone_build_plan_v1",
      ["registryId", "registrySha256", "standaloneTargets"],
      {
        nested: {
          target: STANDALONE_TARGET_CONTRACT
        },
        arrays: { standaloneTargets: "target" },
        validate(value) {
          if (value.registryId !== "control-plane-native-registry-v1") {
            throw new Error("native_registry_build_plan_invalid");
          }
          assertSha256(value.registrySha256, "native_registry_build_plan_invalid");
        }
      }
    )),
    { flag: "wx", mode: 0o600 }
  );

  return Object.freeze({
    sourceRoot,
    manifestPath,
    manifestSha256: sha256Hex(manifest.bytes),
    registrySha256,
    generatedHeaderPath,
    buildPlanPath,
    executableIds: Object.freeze(spawnProfiles.map(({ executableId }) => executableId)),
    environmentIds: Object.freeze(spawnProfiles.map(({ environmentId }) => environmentId)),
    logicalRecordIds: Object.freeze(logicalRecords.map(({ logicalId }) => logicalId)),
    compileProfiles: Object.freeze(compileProfiles.map((profile) => Object.freeze({ ...profile }))),
    standaloneTargets: Object.freeze(standaloneTargets),
    publicNativeExports: FOUNDATION_NATIVE_EXPORTS
  });
}

export function compileReviewedNativeRegistry({ sourceRoot, manifestPath, outputDirectory }) {
  return compileRegistry({ repositoryRoot: REPOSITORY_ROOT, sourceRoot, manifestPath, outputDirectory });
}

// This helper is intentionally test-only: production callers use the fixed repository root above.
export function compileReviewedNativeRegistryFixture({ repositoryRoot, sourceRoot, manifestPath, outputDirectory }) {
  return compileRegistry({ repositoryRoot, sourceRoot, manifestPath, outputDirectory });
}
