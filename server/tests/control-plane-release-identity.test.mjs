import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import {
  loadControlPlaneReleaseIdentity,
  serializeControlPlaneReleaseIdentity
} from "../services/platform/control-plane-release-identity.mjs";
import { createRuntimeState } from "../state.mjs";

const invalidIdentity = (error) =>
  error?.code === "control_plane_release_identity_invalid"
  && error?.message === "control_plane_release_identity_invalid";

function fixtureValue(overrides = {}) {
  return {
    schemaVersion: "1",
    type: "control_plane_release_identity",
    state: "verified",
    releaseUnit: "control-plane-app",
    sourceCommit: "a".repeat(40),
    artifactRelease: "ci-20260830",
    artifactManifestSha256: "b".repeat(64),
    sourceArtifactSha256: "c".repeat(64),
    dependencyArtifactManifestSha256: "d".repeat(64),
    dependencyArchiveSha256: "e".repeat(64),
    ...overrides
  };
}

function withDirectory(name, run) {
  const directory = mkdtempSync(join(tmpdir(), `gccgw-release-identity-${name}-`));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("missing release identity configuration is explicit and immutable", () => {
  const value = loadControlPlaneReleaseIdentity();
  assert.deepEqual(value, { state: "unavailable" });
  assert.equal(Object.isFrozen(value), true);
  assert.throws(() => {
    value.state = "verified";
  }, TypeError);
});

test("canonical release identity is read once and bound to its byte digest", () => withDirectory("valid", (directory) => {
  const path = join(directory, "release-identity.json");
  const bytes = serializeControlPlaneReleaseIdentity(fixtureValue());
  writeFileSync(path, bytes, { mode: 0o600 });

  const value = loadControlPlaneReleaseIdentity({ path });
  assert.deepEqual(value, {
    ...fixtureValue(),
    identitySha256: createHash("sha256").update(bytes).digest("hex")
  });
  assert.equal(Object.isFrozen(value), true);

  writeFileSync(path, serializeControlPlaneReleaseIdentity(fixtureValue({
    sourceCommit: "f".repeat(40)
  })), { mode: 0o600 });
  assert.equal(value.sourceCommit, "a".repeat(40));
}));

test("release identity contract rejects noncanonical and semantically invalid values", () => {
  assert.throws(
    () => serializeControlPlaneReleaseIdentity(fixtureValue({ sourceCommit: "A".repeat(40) })),
    invalidIdentity
  );
  assert.throws(
    () => serializeControlPlaneReleaseIdentity(fixtureValue({ artifactRelease: "../release" })),
    invalidIdentity
  );
  assert.throws(
    () => serializeControlPlaneReleaseIdentity({ ...fixtureValue(), extra: true }),
    invalidIdentity
  );
});

test("configured release identity fails closed for unsafe paths and bytes", () => withDirectory("unsafe", (directory) => {
  const canonicalPath = join(directory, "canonical.json");
  const bytes = serializeControlPlaneReleaseIdentity(fixtureValue());
  writeFileSync(canonicalPath, bytes, { mode: 0o600 });

  if (process.platform !== "win32") {
    chmodSync(canonicalPath, 0o644);
    assert.equal(loadControlPlaneReleaseIdentity({ path: canonicalPath }).state, "verified");
    chmodSync(canonicalPath, 0o600);
  }

  assert.throws(
    () => loadControlPlaneReleaseIdentity({ path: relative(process.cwd(), canonicalPath) }),
    invalidIdentity
  );
  assert.throws(
    () => loadControlPlaneReleaseIdentity({ path: join(directory, "missing.json") }),
    invalidIdentity
  );

  const linkPath = join(directory, "identity-link.json");
  symlinkSync(canonicalPath, linkPath);
  assert.throws(() => loadControlPlaneReleaseIdentity({ path: linkPath }), invalidIdentity);

  const hardlinkPath = join(directory, "identity-hardlink.json");
  linkSync(canonicalPath, hardlinkPath);
  assert.throws(() => loadControlPlaneReleaseIdentity({ path: canonicalPath }), invalidIdentity);
  rmSync(hardlinkPath);

  if (process.platform !== "win32") {
    chmodSync(canonicalPath, 0o622);
    assert.throws(() => loadControlPlaneReleaseIdentity({ path: canonicalPath }), invalidIdentity);
    chmodSync(canonicalPath, 0o600);
  }

  for (const unsafe of [
    Buffer.concat([bytes, Buffer.from("\n")]),
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]),
    Buffer.from(bytes.toString("utf8").replace(
      '"schemaVersion":"1"',
      '"schemaVersion":"1","schemaVersion":"1"'
    )),
    Buffer.from(JSON.stringify(fixtureValue(), null, 2)),
    Buffer.from(JSON.stringify({
      type: "control_plane_release_identity",
      schemaVersion: "1",
      state: "verified",
      releaseUnit: "control-plane-app",
      sourceCommit: "a".repeat(40),
      artifactRelease: "ci-20260830",
      artifactManifestSha256: "b".repeat(64),
      sourceArtifactSha256: "c".repeat(64),
      dependencyArtifactManifestSha256: "d".repeat(64),
      dependencyArchiveSha256: "e".repeat(64)
    }))
  ]) {
    writeFileSync(canonicalPath, unsafe, { mode: 0o600 });
    assert.throws(() => loadControlPlaneReleaseIdentity({ path: canonicalPath }), invalidIdentity);
  }
}));

test("configured release identity rejects empty, oversized and non-file inputs", () => withDirectory("bounded", (directory) => {
  const path = join(directory, "identity.json");
  writeFileSync(path, Buffer.alloc(0), { mode: 0o600 });
  assert.throws(() => loadControlPlaneReleaseIdentity({ path }), invalidIdentity);
  writeFileSync(path, Buffer.alloc(4097, 0x20), { mode: 0o600 });
  assert.throws(() => loadControlPlaneReleaseIdentity({ path }), invalidIdentity);
  assert.throws(() => loadControlPlaneReleaseIdentity({ path: directory }), invalidIdentity);
}));

test("runtime state fails closed on an invalid configured identity before listeners exist", () => {
  assert.throws(() => createRuntimeState({
    rootDir: new URL("../../", import.meta.url),
    env: { CONTROL_PLANE_RELEASE_IDENTITY_PATH: "relative/identity.json" }
  }), invalidIdentity);
});
