import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEPENDENCY_ARTIFACT_SCHEMA_VERSION,
  DEPENDENCY_ARTIFACT_TYPE,
  DependencyArtifactError,
  parseDependencyArtifactManifest
} from "../../scripts/control-plane-dependency-artifact-lib.mjs";
import {
  CandidateDependencyGateError,
  candidateArtifactMaterializationMode,
  validateCandidateDependencyNativeCustodyEvidence
} from "../../scripts/control-plane-candidate-dependency-gate-lib.mjs";

const HASH = "a".repeat(64);
const condition = (name) => (error) => error instanceof DependencyArtifactError && error.condition === name;

function manifest(nativeCustody = undefined) {
  return {
    schemaVersion: "4",
    type: DEPENDENCY_ARTIFACT_TYPE,
    state: "verified",
    releaseUnit: "control-plane-app",
    sourceCommit: "b".repeat(40),
    artifactRelease: "native-contract",
    package: { sha256: HASH, sizeBytes: 1 },
    packageLock: { sha256: HASH, sizeBytes: 1 },
    archive: { fileName: "node-modules.tar", sha256: HASH, sizeBytes: 1 },
    runtime: {
      platform: "linux", arch: "x64", libc: "glibc-2.39", nodeVersion: "v22.23.1",
      nodeAbi: "127", npmVersion: "v10.9.2", betterSqlite3Version: "12.10.0"
    },
    smoke: { betterSqlite3Memory: true, snapshotImport: true },
    tree: { sha256: HASH, entryCount: 4, totalBytes: 4, hardlinksBroken: true, symlinksInternal: true },
    nativeCustody,
    provenance: { builder: "github-actions", workflow: "control-plane-dependency-artifact.yml" }
  };
}

function bundle() {
  return {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_native_custody_bundle",
    buildProfile: "hardened-linux-x86_64-gcc-v2",
    receipt: {
      path: "node_modules/.gccgw-native/welcome-coins-native-build.json",
      sha256: HASH,
      sizeBytes: 1,
      mode: "0644"
    },
    outerWrapper: {
      path: "node_modules/.gccgw-native/welcome-coins-activation-outer-wrapper",
      sha256: HASH,
      sizeBytes: 1,
      mode: "0755",
      kind: "static-pie"
    },
    outerPostExecBootstrap: {
      path: "node_modules/.gccgw-native/welcome-coins-outer-post-exec-bootstrap.so",
      sha256: HASH,
      sizeBytes: 1,
      mode: "0644",
      kind: "shared-object"
    },
    launcher: {
      path: "node_modules/.gccgw-native/welcome-coins-custody-launcher",
      sha256: HASH,
      sizeBytes: 1,
      mode: "0755",
      kind: "pie"
    },
    postExecBootstrap: {
      path: "node_modules/.gccgw-native/welcome-coins-post-exec-bootstrap.so",
      sha256: HASH,
      sizeBytes: 1,
      mode: "0644",
      kind: "shared-object"
    }
  };
}

test("dependency artifact schema v4 requires the exact gcc-v2 four-output native custody bundle", () => {
  assert.equal(DEPENDENCY_ARTIFACT_SCHEMA_VERSION, "4");
  const accepted = parseDependencyArtifactManifest({ bytes: Buffer.from(`${JSON.stringify(manifest(bundle()))}\n`) });
  assert.deepEqual(accepted.value.nativeCustody, bundle());
  assert.throws(
    () => parseDependencyArtifactManifest({ bytes: Buffer.from(JSON.stringify(manifest())) }),
    condition("dependency_native_custody_invalid")
  );
  for (const nativeCustody of [
    { ...bundle(), extra: true },
    { ...bundle(), outerWrapper: { ...bundle().outerWrapper, mode: "0644" } },
    { ...bundle(), outerPostExecBootstrap: { ...bundle().outerPostExecBootstrap, mode: "0755" } },
    { ...bundle(), launcher: { ...bundle().launcher, path: "node_modules/attacker" } },
    { ...bundle(), launcher: { ...bundle().launcher, mode: "0644" } },
    { ...bundle(), postExecBootstrap: { ...bundle().postExecBootstrap, mode: "0755" } },
    { ...bundle(), receipt: { ...bundle().receipt, sha256: "not-a-hash" } }
  ]) assert.throws(
    () => parseDependencyArtifactManifest({ bytes: Buffer.from(JSON.stringify(manifest(nativeCustody))) }),
    condition("dependency_native_custody_invalid")
  );
});

test("dependency consumer imports only the side-effect-free native contract", () => {
  const source = readFileSync(resolve("scripts/control-plane-dependency-artifact-lib.mjs"), "utf8");
  assert.match(source, /from "\.\/control-plane-welcome-coins-native-contract\.mjs"/u);
  assert.doesNotMatch(source, /from "\.\/control-plane-welcome-coins-native-build-lib\.mjs"/u);
});

test("CI rebuilds the reviewed native bundle after each npm ci and verifies it before archive publication", () => {
  const workflow = readFileSync(resolve(".github/workflows/control-plane-dependency-artifact.yml"), "utf8");
  const builds = [...workflow.matchAll(/control-plane-welcome-coins-native-build-cli\.mjs[\s\\]+--mode build/g)];
  assert.equal(builds.length, 2);
  assert.match(workflow, /control-plane-welcome-coins-native-build-cli\.mjs[\s\\]+--mode verify/);
  const secondInstall = workflow.indexOf("npm ci --omit=dev --no-audit --no-fund", workflow.indexOf("npm ci --omit=dev --no-audit --no-fund") + 1);
  assert.ok(secondInstall > 0);
  assert.ok(builds[1].index > secondInstall);
  assert.ok(workflow.indexOf("node-modules-b.tar") > builds[1].index);
  const expectedNativeFiles = [
    "welcome-coins-activation-outer-wrapper",
    "welcome-coins-outer-post-exec-bootstrap.so",
    "welcome-coins-custody-launcher",
    "welcome-coins-post-exec-bootstrap.so",
    "welcome-coins-native-build.json"
  ];
  const copiedNativeFiles = [...workflow.matchAll(
    /cp --preserve=mode node_modules\/\.gccgw-native\/([^\s]+) \.dependency-artifacts\/native-a\//gu
  )].map((match) => match[1]);
  const comparedNativeFiles = [...workflow.matchAll(
    /cmp --silent \.dependency-artifacts\/native-a\/([^\s]+) node_modules\/\.gccgw-native\/([^\s]+)/gu
  )].map((match) => {
    assert.equal(match[1], match[2]);
    return match[1];
  });
  assert.deepEqual(copiedNativeFiles, expectedNativeFiles);
  assert.deepEqual(comparedNativeFiles, expectedNativeFiles);
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  assert.equal(Object.hasOwn(packageJson.scripts, "welcome-coins:activation:transaction"), false);
  assert.match(
    workflow,
    /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803\s+# v6/u
  );
  assert.match(
    workflow,
    /actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38\s+# v6/u
  );
  assert.match(
    workflow,
    /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a\s+# v7/u
  );
  assert.doesNotMatch(workflow, /uses:\s+actions\/[^@\s]+@v[0-9]+/u);
});

test("candidate normalization grants execute permission to exactly the two reviewed wrappers", () => {
  const cases = [
    ["node_modules/.gccgw-native/welcome-coins-activation-outer-wrapper", "file", 0o600, 0o755],
    ["node_modules/.gccgw-native/welcome-coins-custody-launcher", "file", 0o600, 0o755],
    ["node_modules/.gccgw-native/welcome-coins-outer-post-exec-bootstrap.so", "file", 0o755, 0o644],
    ["node_modules/.gccgw-native/welcome-coins-post-exec-bootstrap.so", "file", 0o755, 0o644],
    ["node_modules/.gccgw-native/welcome-coins-native-build.json", "file", 0o755, 0o644],
    ["node_modules/unreviewed-tool", "file", 0o755, 0o644],
    ["node_modules/.gccgw-native", "directory", 0o700, 0o755]
  ];
  for (const [relativePath, type, sourceMode, expected] of cases) {
    assert.equal(candidateArtifactMaterializationMode({ relativePath, type, sourceMode }), expected);
  }
  for (const relativePath of cases.slice(0, 2).map(([path]) => path)) {
    for (const type of ["directory", "symlink"]) {
      assert.throws(
        () => candidateArtifactMaterializationMode({ relativePath, type, sourceMode: 0o755 }),
        (error) => error instanceof CandidateDependencyGateError
          && error.condition === "candidate_tree_invalid"
      );
    }
  }
});

test("candidate artifact evidence requires the complete exact gcc-v2 native bundle", () => {
  assert.equal(
    validateCandidateDependencyNativeCustodyEvidence(bundle()).buildProfile,
    bundle().buildProfile
  );
  const { outerWrapper: _outerWrapper, ...withoutOuterWrapper } = bundle();
  const { outerPostExecBootstrap: _outerBootstrap, ...withoutOuterBootstrap } = bundle();
  const mutations = [
    withoutOuterWrapper,
    withoutOuterBootstrap,
    { ...bundle(), buildProfile: "hardened-linux-x86_64-gcc-v1" },
    { ...bundle(), receipt: { ...bundle().receipt, extra: true } },
    { ...bundle(), extra: true }
  ];
  for (const value of mutations) {
    assert.throws(
      () => validateCandidateDependencyNativeCustodyEvidence(value),
      (error) => error instanceof CandidateDependencyGateError
        && error.condition === "dependency_artifact_invalid"
    );
  }
});

test("candidate shared validator fail-closes reordered native custody contract keys", () => {
  const accepted = bundle();
  const topLevelEntries = Object.entries(accepted);
  const reorderedBundle = Object.fromEntries([
    topLevelEntries[1],
    topLevelEntries[0],
    ...topLevelEntries.slice(2)
  ]);
  const outerWrapperEntries = Object.entries(accepted.outerWrapper);
  const reorderedOuterWrapper = Object.fromEntries([
    outerWrapperEntries[1],
    outerWrapperEntries[0],
    ...outerWrapperEntries.slice(2)
  ]);

  for (const value of [
    reorderedBundle,
    { ...accepted, outerWrapper: reorderedOuterWrapper }
  ]) {
    assert.throws(
      () => validateCandidateDependencyNativeCustodyEvidence(value),
      (error) => error instanceof CandidateDependencyGateError
        && error.condition === "dependency_artifact_invalid"
    );
  }
});

test("runbook assigns production digest consumption only to the absolute one-shot wrapper", () => {
  const runbook = readFileSync(resolve("docs/GITHUB_DEPLOYMENT_RUNBOOK.md"), "utf8");
  const section = runbook.slice(
    runbook.indexOf("### Welcome Coins Admission Activation Gate"),
    runbook.indexOf("### Condition-Driven Promotion Health Window")
  );
  assert.doesNotMatch(section, /Only `activate --apply` consumes/u);
  assert.match(
    section,
    /absolute candidate path[\s\S]*one-shot[\s\S]*stdin[\s\S]*digest/iu
  );
  assert.match(
    section,
    /standalone `activate --apply` and `deactivate --apply`[\s\S]*execution_envelope_required[\s\S]*no production mutation authority/iu
  );
  assert.match(
    section,
    /standalone activation or deactivation apply[\s\S]*execution_envelope_required/iu
  );
  assert.match(
    section,
    /standalone verify[\s\S]*read-only[\s\S]*cannot substitute[\s\S]*private post-activation\s+verification/iu
  );
  assert.doesNotMatch(section, /standalone activation apply or verify command/iu);
});

test("candidate production evidence carries and re-reads the exact native custody bundle", () => {
  const source = readFileSync(resolve("scripts/control-plane-candidate-dependency-gate-lib.mjs"), "utf8");
  assert.match(source, /tree:\s*prepared\.tree,\s*nativeCustody:\s*prepared\.nativeCustody/u);
  const publishedReadbacks = source.match(
    /inspectWelcomeCoinsNativeCustodyBundle\(\{\s*root:\s*value\.c\.candidateRoot,\s*enforceModes:\s*true\s*\}\)/gu
  ) ?? [];
  assert.ok(
    publishedReadbacks.length >= 2,
    "materialize and verify must each inspect the published native bundle"
  );
});
