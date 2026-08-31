import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "../deployment/canonical-json.mjs";

const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const RELEASE = /^[A-Za-z0-9._-]{1,160}$/;
const MAX_BYTES = 4096;

function invalid() {
  const error = new Error("control_plane_release_identity_invalid");
  error.code = "control_plane_release_identity_invalid";
  return error;
}

const FIELDS = Object.freeze([
  "schemaVersion",
  "type",
  "state",
  "releaseUnit",
  "sourceCommit",
  "artifactRelease",
  "artifactManifestSha256",
  "sourceArtifactSha256",
  "dependencyArtifactManifestSha256",
  "dependencyArchiveSha256"
]);

export const CONTROL_PLANE_RELEASE_IDENTITY_CONTRACT = Object.freeze({
  schemaId: "control_plane_release_identity",
  maxBytes: MAX_BYTES,
  fieldOrder: FIELDS,
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (
      value.schemaVersion !== "1"
      || value.type !== "control_plane_release_identity"
      || value.state !== "verified"
      || value.releaseUnit !== "control-plane-app"
      || !COMMIT.test(value.sourceCommit)
      || !RELEASE.test(value.artifactRelease)
      || !HASH.test(value.artifactManifestSha256)
      || !HASH.test(value.sourceArtifactSha256)
      || !HASH.test(value.dependencyArtifactManifestSha256)
      || !HASH.test(value.dependencyArchiveSha256)
    ) {
      throw invalid();
    }
  }
});

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.nlink === right.nlink
    && left.mode === right.mode
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function assertSafeRegularFile(metadata) {
  if (
    metadata.isSymbolicLink()
    || !metadata.isFile()
    || metadata.nlink !== 1
    || !Number.isSafeInteger(metadata.size)
    || metadata.size < 1
    || metadata.size > MAX_BYTES
    || (process.platform !== "win32" && (metadata.mode & 0o022) !== 0)
  ) {
    throw invalid();
  }
}

function readBoundedIdentityBytes(descriptor) {
  const buffer = Buffer.allocUnsafe(MAX_BYTES + 1);
  let length = 0;
  while (length < buffer.length) {
    const count = readSync(
      descriptor,
      buffer,
      length,
      buffer.length - length,
      null
    );
    if (!Number.isSafeInteger(count) || count < 0 || count > buffer.length - length) {
      throw invalid();
    }
    if (count === 0) break;
    length += count;
  }
  if (length < 1 || length > MAX_BYTES) throw invalid();
  return buffer.subarray(0, length);
}

export function serializeControlPlaneReleaseIdentity(value) {
  try {
    return serializeCanonicalJsonBytes(value, CONTROL_PLANE_RELEASE_IDENTITY_CONTRACT);
  } catch {
    throw invalid();
  }
}

export function loadControlPlaneReleaseIdentity({ path } = {}) {
  const configuredPath = String(path ?? "").trim();
  if (!configuredPath) return Object.freeze({ state: "unavailable" });

  let descriptor;
  try {
    if (!isAbsolute(configuredPath) || resolve(configuredPath) !== configuredPath) {
      throw invalid();
    }
    const before = lstatSync(configuredPath);
    assertSafeRegularFile(before);
    if (realpathSync(configuredPath) !== configuredPath) throw invalid();

    descriptor = openSync(
      configuredPath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
    );
    const opened = fstatSync(descriptor);
    assertSafeRegularFile(opened);
    if (!sameIdentity(before, opened)) throw invalid();

    const bytes = readBoundedIdentityBytes(descriptor);
    if (bytes.length !== opened.size) throw invalid();
    const afterRead = fstatSync(descriptor);
    const linked = lstatSync(configuredPath);
    assertSafeRegularFile(afterRead);
    assertSafeRegularFile(linked);
    if (
      !sameIdentity(opened, afterRead)
      || !sameIdentity(opened, linked)
      || realpathSync(configuredPath) !== configuredPath
    ) {
      throw invalid();
    }

    const value = parseCanonicalJsonBytes(
      bytes,
      CONTROL_PLANE_RELEASE_IDENTITY_CONTRACT
    );
    return Object.freeze({
      ...value,
      identitySha256: sha256Hex(bytes)
    });
  } catch {
    throw invalid();
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // The identity was already read into immutable memory. A descriptor
        // close failure does not make retrying a mutable pathname safer.
      }
    }
  }
}
