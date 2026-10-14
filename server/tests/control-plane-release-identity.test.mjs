import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs, {
  chmodSync,
  linkSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
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

function withDirectory(name, run, parentDirectory = tmpdir()) {
  const directory = mkdtempSync(join(parentDirectory, `gccgw-release-identity-${name}-`));
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

// On Windows keep this fixture on cwd's volume: relative() returns an absolute
// path when the system temp directory is on a different drive.
test("configured release identity fails closed for unsafe paths and bytes", () => withDirectory("unsafe", (directory) => {
  const canonicalPath = join(directory, "canonical.json");
  const bytes = serializeControlPlaneReleaseIdentity(fixtureValue());
  writeFileSync(canonicalPath, bytes, { mode: 0o600 });

  if (process.platform !== "win32") {
    chmodSync(canonicalPath, 0o644);
    assert.equal(loadControlPlaneReleaseIdentity({ path: canonicalPath }).state, "verified");
    chmodSync(canonicalPath, 0o600);
  }

  const relativePath = relative(process.cwd(), canonicalPath);
  assert.notEqual(relativePath, "");
  assert.equal(isAbsolute(relativePath), false, "unsafe fixture must exercise a relative path");
  assert.equal(resolve(relativePath), canonicalPath, "relative fixture must point to the valid file");
  assert.throws(
    () => loadControlPlaneReleaseIdentity({ path: relativePath }),
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
}, process.platform === "win32" ? process.cwd() : tmpdir()));

test(
  "release identity descriptor reads stay bounded if the file grows after metadata validation",
  { concurrency: false },
  () => withDirectory("growth", (directory) => {
    const path = join(directory, "identity.json");
    writeFileSync(path, serializeControlPlaneReleaseIdentity(fixtureValue()), { mode: 0o600 });
    const target = fs.statSync(path);

    const originalFstatSync = fs.fstatSync;
    const originalReadFileSync = fs.readFileSync;
    const originalReadSync = fs.readSync;
    const requested = [];
    const returned = [];
    let readFileBytes = 0;
    let readFileCalls = 0;
    let targetDescriptor;
    let grew = false;
    try {
      fs.fstatSync = (descriptor, ...args) => {
        const metadata = originalFstatSync.call(fs, descriptor, ...args);
        if (!grew && metadata.dev === target.dev && metadata.ino === target.ino) {
          grew = true;
          targetDescriptor = descriptor;
          fs.truncateSync(path, 8 * 1024 * 1024);
        }
        return metadata;
      };
      fs.readFileSync = (descriptor, ...args) => {
        const bytes = originalReadFileSync.call(fs, descriptor, ...args);
        if (descriptor === targetDescriptor) {
          readFileCalls += 1;
          readFileBytes += bytes.length;
        }
        return bytes;
      };
      fs.readSync = (descriptor, buffer, offset, length, ...args) => {
        const count = originalReadSync.call(
          fs,
          descriptor,
          buffer,
          offset,
          length,
          ...args
        );
        if (descriptor === targetDescriptor) {
          requested.push(length);
          returned.push(count);
        }
        return count;
      };
      syncBuiltinESMExports();

      assert.throws(() => loadControlPlaneReleaseIdentity({ path }), invalidIdentity);
    } finally {
      fs.fstatSync = originalFstatSync;
      fs.readFileSync = originalReadFileSync;
      fs.readSync = originalReadSync;
      syncBuiltinESMExports();
    }

    assert.equal(grew, true);
    assert.equal(readFileCalls, 0);
    assert.equal(readFileBytes, 0);
    assert.ok(requested.length > 0);
    assert.ok(requested.every((length) => length <= 4097));
    assert.ok(returned.reduce((total, length) => total + length, 0) <= 4097);
    assert.throws(
      () => originalFstatSync.call(fs, targetDescriptor),
      (error) => error?.code === "EBADF"
    );
  })
);

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
