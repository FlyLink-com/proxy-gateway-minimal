import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { parseCanonicalJsonBytes, sha256Hex } from "../server/services/deployment/canonical-json.mjs";
import { HARDENED_C17_PIE_V1_FLAGS } from "../server/services/deployment/foundation-contract.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const TREE_PATH_PATTERN = /^(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*$/;
const ROLE_PATHS = Object.freeze({
  compiler: "bin/cc",
  cxx: "bin/c++",
  archiver: "bin/ar",
  linker: "bin/ld",
  python: "bin/python3",
  make: "bin/make"
});
const TOOLCHAIN_BRAND = new WeakSet();

function frozenContract(schemaId, fieldOrder, { nested = {}, arrays = {}, validate = () => {} } = {}) {
  return Object.freeze({
    schemaId,
    maxBytes: 1024 * 1024,
    fieldOrder: Object.freeze([...fieldOrder]),
    nested: Object.freeze({ ...nested }),
    arrays: Object.freeze({ ...arrays }),
    validate
  });
}

function assertDigest(value, code) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw new Error(code);
}

const TREE_ENTRY_CONTRACT = frozenContract(
  "control_plane_toolchain_tree_entry_v1",
  ["path", "mode", "size", "sha256"],
  {
    validate(value) {
      if (typeof value.path !== "string" || !TREE_PATH_PATTERN.test(value.path)
          || value.path.includes("..")
          || typeof value.mode !== "string" || !/^0[0-7]{3}$/.test(value.mode)
          || !Number.isSafeInteger(value.size) || value.size < 0) {
        throw new Error("native_toolchain_tree_entry_invalid");
      }
      assertDigest(value.sha256, "native_toolchain_tree_entry_invalid");
    }
  }
);

const EXECUTABLE_CONTRACT = frozenContract(
  "control_plane_toolchain_executable_v1",
  ["role", "path", "sha256"],
  {
    validate(value) {
      if (!Object.hasOwn(ROLE_PATHS, value.role) || value.path !== ROLE_PATHS[value.role]) {
        throw new Error("native_toolchain_executable_invalid");
      }
      assertDigest(value.sha256, "native_toolchain_executable_invalid");
    }
  }
);

const CLOSURE_ENTRY_CONTRACT = frozenContract(
  "control_plane_toolchain_closure_entry_v1",
  ["path", "sha256"],
  {
    validate(value) {
      if (typeof value.path !== "string" || !TREE_PATH_PATTERN.test(value.path) || value.path.includes("..")) {
        throw new Error("native_toolchain_closure_entry_invalid");
      }
      assertDigest(value.sha256, "native_toolchain_closure_entry_invalid");
    }
  }
);

const TOOLCHAIN_MANIFEST_CONTRACT = frozenContract(
  "control_plane_native_toolchain_manifest_v1",
  ["schemaVersion", "toolchainId", "treeSha256", "entries", "executables", "executableClosure"],
  {
    nested: {
      entry: TREE_ENTRY_CONTRACT,
      executable: EXECUTABLE_CONTRACT,
      closure: CLOSURE_ENTRY_CONTRACT
    },
    arrays: {
      entries: "entry",
      executables: "executable",
      executableClosure: "closure"
    },
    validate(value) {
      if (value.schemaVersion !== 1 || typeof value.toolchainId !== "string"
          || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value.toolchainId)) {
        throw new Error("native_toolchain_manifest_invalid");
      }
      assertDigest(value.treeSha256, "native_toolchain_manifest_invalid");
    }
  }
);

function assertDirectory(path, code) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(code);
}

function assertRegularFile(path, code) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(code);
  return metadata;
}

function relativeFiles(root, directory = root) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relativePath = relative(root, path).split(sep).join("/");
    if (entry.isSymbolicLink()) throw new Error("native_toolchain_symlink_forbidden");
    if (entry.isDirectory()) {
      files.push(...relativeFiles(root, path));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error("native_toolchain_entry_type_invalid");
    }
  }
  return files.sort();
}

function canonicalTreeDigest(entries) {
  return sha256Hex(Buffer.from(entries.map(({ path, mode, size, sha256 }) => (
    `${path}\0${mode}\0${size}\0${sha256}\n`
  )).join(""), "utf8"));
}

function assertOrderedUnique(values, code) {
  if (new Set(values).size !== values.length
      || values.some((value, index) => index > 0 && value <= values[index - 1])) {
    throw new Error(code);
  }
}

function assertProfileBindings(compileProfiles, manifest) {
  if (!Array.isArray(compileProfiles) || compileProfiles.length !== 1) {
    throw new Error("native_toolchain_compile_profile_invalid");
  }
  const profile = compileProfiles[0];
  if (!profile || typeof profile !== "object"
      || profile.compileProfileId !== "hardened-c17-pie-v1"
      || profile.toolchainId !== manifest.toolchainId
      || profile.compilerRelativePath !== ROLE_PATHS.compiler
      || !Array.isArray(profile.flags)
      || profile.flags.length !== HARDENED_C17_PIE_V1_FLAGS.length
      || profile.flags.some((flag, index) => flag !== HARDENED_C17_PIE_V1_FLAGS[index])) {
    throw new Error("native_toolchain_compile_profile_invalid");
  }
  const compiler = manifest.executables.find(({ role }) => role === "compiler");
  if (!compiler || profile.compilerSha256 !== compiler.sha256) {
    throw new Error("native_toolchain_compile_profile_invalid");
  }
}

function verifyClosure(root, closure) {
  for (const entry of closure) {
    const path = resolve(root, entry.path);
    const relativePath = relative(root, path);
    if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
      throw new Error("native_toolchain_closure_path_invalid");
    }
    const metadata = assertRegularFile(path, "native_toolchain_closure_entry_invalid");
    if ((metadata.mode & 0o111) === 0 || sha256Hex(readFileSync(path)) !== entry.sha256) {
      throw new Error("native_toolchain_closure_digest_mismatch");
    }
  }
}

export function verifyNativeToolchainTree({ directory, manifestPath, expectedSha256, compileProfiles }) {
  if (process.platform !== "linux") throw new Error("native_toolchain_linux_required");
  if (typeof directory !== "string" || typeof manifestPath !== "string") {
    throw new Error("native_toolchain_input_invalid");
  }
  assertDigest(expectedSha256, "native_toolchain_expected_digest_invalid");
  assertDirectory(directory, "native_toolchain_directory_invalid");
  assertRegularFile(manifestPath, "native_toolchain_manifest_invalid");
  const root = realpathSync(directory);
  const resolvedManifestPath = realpathSync(manifestPath);
  const manifestRelativeToRoot = relative(root, resolvedManifestPath);
  if (manifestRelativeToRoot === "" || (!manifestRelativeToRoot.startsWith(`..${sep}`) && manifestRelativeToRoot !== "..")) {
    throw new Error("native_toolchain_manifest_location_invalid");
  }
  const manifest = parseCanonicalJsonBytes(readFileSync(resolvedManifestPath), TOOLCHAIN_MANIFEST_CONTRACT);
  if (manifest.treeSha256 !== expectedSha256) throw new Error("native_toolchain_expected_digest_mismatch");
  assertOrderedUnique(manifest.entries.map(({ path }) => path), "native_toolchain_entry_order_invalid");
  assertOrderedUnique(manifest.executableClosure.map(({ path }) => path), "native_toolchain_closure_order_invalid");
  const roles = Object.keys(ROLE_PATHS);
  if (manifest.executables.length !== roles.length
      || manifest.executables.some(({ role }, index) => role !== roles[index])) {
    throw new Error("native_toolchain_executable_set_invalid");
  }
  for (const role of roles) {
    const executable = manifest.executables.find((entry) => entry.role === role);
    const closure = manifest.executableClosure.find((entry) => entry.path === ROLE_PATHS[role]);
    if (!executable || executable.path !== ROLE_PATHS[role]
        || !closure || closure.sha256 !== executable.sha256) {
      throw new Error("native_toolchain_executable_set_invalid");
    }
  }
  assertProfileBindings(compileProfiles, manifest);

  const manifestPaths = manifest.entries.map(({ path }) => path);
  const discoveredPaths = relativeFiles(root);
  if (manifestPaths.length !== discoveredPaths.length
      || manifestPaths.some((path, index) => path !== discoveredPaths[index])) {
    throw new Error("native_toolchain_tree_entry_set_mismatch");
  }
  const verifiedEntries = manifest.entries.map((entry) => {
    const path = resolve(root, entry.path);
    const relativePath = relative(root, path);
    if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
      throw new Error("native_toolchain_entry_path_invalid");
    }
    const metadata = assertRegularFile(path, "native_toolchain_entry_invalid");
    const mode = `0${(metadata.mode & 0o777).toString(8).padStart(3, "0")}`;
    if (mode !== entry.mode || metadata.size !== entry.size || sha256Hex(readFileSync(path)) !== entry.sha256) {
      throw new Error("native_toolchain_tree_digest_mismatch");
    }
    return Object.freeze({ ...entry });
  });
  const treeSha256 = canonicalTreeDigest(verifiedEntries);
  if (treeSha256 !== expectedSha256) throw new Error("native_toolchain_tree_digest_mismatch");
  verifyClosure(root, manifest.executableClosure);

  const executableByRole = Object.fromEntries(manifest.executables.map((entry) => [entry.role, entry]));
  const result = Object.freeze({
    treeSha256,
    toolchainId: manifest.toolchainId,
    binDirectory: join(root, "bin"),
    compiler: Object.freeze({ path: join(root, executableByRole.compiler.path), sha256: executableByRole.compiler.sha256 }),
    cxx: Object.freeze({ path: join(root, executableByRole.cxx.path), sha256: executableByRole.cxx.sha256 }),
    archiver: Object.freeze({ path: join(root, executableByRole.archiver.path), sha256: executableByRole.archiver.sha256 }),
    linker: Object.freeze({ path: join(root, executableByRole.linker.path), sha256: executableByRole.linker.sha256 }),
    python: Object.freeze({ path: join(root, executableByRole.python.path), sha256: executableByRole.python.sha256 }),
    make: Object.freeze({ path: join(root, executableByRole.make.path), sha256: executableByRole.make.sha256 }),
    executableDigests: Object.freeze(manifest.executableClosure.map((entry) => Object.freeze({ ...entry }))),
    assertExecutableClosureUnchanged: () => verifyClosure(root, manifest.executableClosure)
  });
  TOOLCHAIN_BRAND.add(result);
  return result;
}

export function createVerifiedNativeToolEnvironment(verifiedToolchain) {
  if (!TOOLCHAIN_BRAND.has(verifiedToolchain)) throw new Error("verified_native_toolchain_brand_invalid");
  return Object.freeze({
    PATH: verifiedToolchain.binDirectory,
    CC: verifiedToolchain.compiler.path,
    CXX: verifiedToolchain.cxx.path,
    AR: verifiedToolchain.archiver.path,
    LD: verifiedToolchain.linker.path,
    PYTHON: verifiedToolchain.python.path,
    MAKE: verifiedToolchain.make.path
  });
}

export function assertVerifiedNativeToolchain(value) {
  if (!TOOLCHAIN_BRAND.has(value)) throw new Error("verified_native_toolchain_brand_invalid");
  return value;
}
