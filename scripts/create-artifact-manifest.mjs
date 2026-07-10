#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ARTIFACT_RELEASE_UNITS = Object.freeze([
  "control-plane-app",
  "company-site-static",
  "portal-static",
  "admin-static",
  "japan-runtime-config",
  "sgp-runtime-config",
  "subscription-rendering",
  "attribution-appsflyer"
]);

const ARTIFACT_RELEASE_UNIT_SET = new Set(ARTIFACT_RELEASE_UNITS);
const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const RELEASE_PATTERN = /^[A-Za-z0-9._-]{1,160}$/;

export function createArtifactManifest({
  releaseUnit,
  sourceCommit,
  release,
  artifactPath,
  createdAt = new Date().toISOString()
} = {}) {
  if (!ARTIFACT_RELEASE_UNIT_SET.has(releaseUnit)) {
    throw new Error("artifact_manifest_release_unit_invalid");
  }
  const normalizedSourceCommit = String(sourceCommit ?? "").trim().toLowerCase();
  if (!SOURCE_COMMIT_PATTERN.test(normalizedSourceCommit)) {
    throw new Error("artifact_manifest_source_commit_invalid");
  }
  const normalizedRelease = String(release ?? "").trim();
  if (!RELEASE_PATTERN.test(normalizedRelease)) {
    throw new Error("artifact_manifest_release_invalid");
  }
  const parsedCreatedAt = new Date(createdAt);
  if (Number.isNaN(parsedCreatedAt.getTime())) {
    throw new Error("artifact_manifest_created_at_invalid");
  }
  const artifactBytes = readFileSync(artifactPath);
  const artifactStat = statSync(artifactPath);

  return {
    schemaVersion: "1",
    releaseUnit,
    sourceCommit: normalizedSourceCommit,
    release: normalizedRelease,
    artifact: {
      fileName: basename(artifactPath),
      sha256: createHash("sha256").update(artifactBytes).digest("hex"),
      sizeBytes: artifactStat.size,
      createdAt: parsedCreatedAt.toISOString()
    }
  };
}

function argValue(argv, name) {
  const prefix = `${name}=`;
  const inline = argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : "";
}

function requiredArg(argv, name) {
  const value = argValue(argv, name).trim();
  if (!value) {
    throw new Error("artifact_manifest_argument_missing");
  }
  return value;
}

function comparablePath(path) {
  const absolutePath = resolve(path);
  return process.platform === "win32" ? absolutePath.toLowerCase() : absolutePath;
}

export function runArtifactManifestCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const artifactPath = requiredArg(argv, "--artifact");
    const outputPath = requiredArg(argv, "--output");
    if (comparablePath(artifactPath) === comparablePath(outputPath)) {
      throw new Error("artifact_manifest_output_conflicts_with_artifact");
    }
    const manifest = createArtifactManifest({
      releaseUnit: requiredArg(argv, "--release-unit"),
      sourceCommit: requiredArg(argv, "--source-commit"),
      release: requiredArg(argv, "--release"),
      artifactPath,
      createdAt: argValue(argv, "--created-at") || new Date().toISOString()
    });

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
    stdout.write(`${JSON.stringify({
      type: "artifact_manifest_generation",
      ok: true,
      releaseUnit: manifest.releaseUnit,
      artifactFile: manifest.artifact.fileName,
      outputFile: basename(outputPath)
    })}\n`);
    return 0;
  } catch {
    stderr.write(`${JSON.stringify({
      type: "artifact_manifest_generation",
      ok: false,
      error: "artifact_manifest_generation_failed"
    })}\n`);
    return 1;
  }
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  process.exitCode = runArtifactManifestCli();
}
